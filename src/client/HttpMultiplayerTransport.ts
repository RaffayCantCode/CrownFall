import type { Intent, StampedIntent, Turn } from "@openfront/engine-api/Schemas";
import type {
  ClientMessage,
  GameInfo,
  ServerMessage,
  WireGameStartInfo,
} from "@openfront/shared/WireSchemas";
import { ClientEnv } from "./ClientEnv";
import { getPlayToken } from "./Auth";
import type { LobbyConfig } from "./ClientGameRunner";

interface SyncResponse {
  stage: "lobby" | "started" | "finished";
  serverTime: number;
  myClientID: string;
  lobbyCreatedAt?: number;
  lobby?: GameInfo;
  gameStartInfo?: WireGameStartInfo;
  sinceTurn?: number;
  safeTurn?: number;
  intentsByTurn?: Record<string, StampedIntent[]>;
  successorId?: string;
  error?: string;
}

const LOBBY_POLL_MS = 250;
const GAME_POLL_MS = 160;

/**
 * Deterministic Lockstep Multiplayer Transport over HTTP (`/api/mp/sync`),
 * designed for serverless deployments (Cloudflare Pages Functions + D1).
 *
 * Buffers verified lockstep turns up to `safeTurn` and feeds them at the
 * engine's 100ms cadence so gameplay renders smoothly with zero desync.
 */
export class HttpMultiplayerTransport {
  private onconnect: () => void = () => {};
  private onmessage: (msg: ServerMessage) => void = () => {};
  private stopped = false;
  private pollTimer: number | null = null;
  private tickPacerTimer: number | null = null;
  private syncInFlight = false;
  private pendingFlush = false;

  private stage: "lobby" | "started" | "finished" = "lobby";
  private emittedStart = false;
  private emittedSuccessorId: string | null = null;

  // Next turn number the server has not yet confirmed for us
  private nextFetchTurn = 0;
  // Next turn number to feed to ClientGameRunner
  private nextDeliverTurn = 0;
  private verifiedTurns = new Map<number, Turn>();

  private queuedIntents: Intent[] = [];
  private latestSpectator: boolean | undefined;
  private pendingWinner: unknown = undefined;

  constructor(private readonly lobbyConfig: LobbyConfig) {}

  public updateCallback(
    onconnect: () => void,
    onmessage: (msg: ServerMessage) => void,
  ): void {
    this.onconnect = onconnect;
    this.onmessage = onmessage;
  }

  public start(
    onconnect: () => void,
    onmessage: (msg: ServerMessage) => void,
  ): void {
    this.stopped = false;
    this.onconnect = onconnect;
    this.onmessage = onmessage;
    this.startTickPacer();
    // Notify caller immediately so ClientGameRunner invokes joinGame()
    queueMicrotask(() => {
      if (!this.stopped) {
        this.onconnect();
      }
    });
  }

  public sendMsg(msg: ClientMessage): void {
    if (this.stopped) return;

    if (msg.type === "join") {
      this.latestSpectator = msg.spectator;
      void this.performSync("join", msg.token);
      return;
    }
    if (msg.type === "rejoin") {
      this.nextFetchTurn = msg.lastTurn;
      this.nextDeliverTurn = msg.lastTurn;
      this.verifiedTurns.clear();
      this.emittedStart = false;
      void this.performSync("rejoin", msg.token);
      return;
    }
    if (msg.type === "spectate") {
      this.latestSpectator = msg.spectator;
      this.triggerImmediateSync();
      return;
    }
    if (msg.type === "intent") {
      this.queuedIntents.push(msg.intent);
      this.triggerImmediateSync();
      return;
    }
    if (msg.type === "winner") {
      this.pendingWinner = msg.winner;
      this.triggerImmediateSync();
      return;
    }
    if (msg.type === "ping") {
      this.onmessage({ type: "pong", sentAt: msg.sentAt });
    }
  }

  public stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.pollTimer !== null) {
      window.clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.tickPacerTimer !== null) {
      window.clearInterval(this.tickPacerTimer);
      this.tickPacerTimer = null;
    }
    // Best-effort leave notification while still in lobby
    if (this.stage === "lobby") {
      void getPlayToken()
        .then((token) =>
          fetch("/api/mp/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "leave",
              gameID: this.lobbyConfig.gameID,
              token,
            }),
            keepalive: true,
          }),
        )
        .catch(() => {});
    }
  }

  private startTickPacer(): void {
    if (this.tickPacerTimer !== null) return;
    const intervalMs = Math.max(25, Math.floor(ClientEnv.turnIntervalMs() / 2));
    let lastDeliveredAt = 0;
    this.tickPacerTimer = window.setInterval(() => {
      if (this.stopped || !this.emittedStart) return;
      const backlog = this.verifiedTurns.size;
      if (backlog === 0) return;

      const now = performance.now();
      // Pace smoothly at 100ms normally; catch up faster if >4 turns queued
      const targetSpacing =
        backlog > 6 ? 25 : backlog > 3 ? 65 : ClientEnv.turnIntervalMs();
      if (now - lastDeliveredAt < targetSpacing) return;

      const turn = this.verifiedTurns.get(this.nextDeliverTurn);
      if (!turn) return;
      this.verifiedTurns.delete(this.nextDeliverTurn);
      this.nextDeliverTurn++;
      lastDeliveredAt = now;
      this.onmessage({ type: "turn", turn });
    }, intervalMs);
  }

  private triggerImmediateSync(): void {
    if (this.stopped) return;
    if (this.syncInFlight) {
      this.pendingFlush = true;
      return;
    }
    if (this.pollTimer !== null) {
      window.clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    void this.performSync("sync");
  }

  private scheduleNextPoll(): void {
    if (this.stopped || this.pollTimer !== null) return;
    const delay = this.stage === "lobby" ? LOBBY_POLL_MS : GAME_POLL_MS;
    this.pollTimer = window.setTimeout(() => {
      this.pollTimer = null;
      void this.performSync("sync");
    }, delay);
  }

  private async performSync(
    action: "join" | "rejoin" | "sync",
    explicitToken?: string,
  ): Promise<void> {
    if (this.stopped) return;
    if (this.syncInFlight && action === "sync") {
      this.pendingFlush = true;
      return;
    }

    this.syncInFlight = true;
    const intentsBatch = this.queuedIntents.splice(0);
    const winnerBatch = this.pendingWinner;
    this.pendingWinner = undefined;

    try {
      const token = explicitToken ?? (await getPlayToken());
      if (this.stopped) return;

      const res = await fetch("/api/mp/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action,
          gameID: this.lobbyConfig.gameID,
          token,
          username: this.lobbyConfig.playerName,
          clanTag: this.lobbyConfig.playerClanTag ?? null,
          cosmetics: this.lobbyConfig.cosmetics,
          spectator: this.latestSpectator,
          sinceTurn: this.nextFetchTurn,
          ...(intentsBatch.length > 0 ? { intents: intentsBatch } : {}),
          ...(winnerBatch !== undefined ? { winner: winnerBatch } : {}),
        }),
      });

      if (this.stopped) return;

      const data = (await res.json().catch(() => null)) as SyncResponse | null;
      if (!res.ok || !data) {
        if (intentsBatch.length > 0) {
          this.queuedIntents.unshift(...intentsBatch);
        }
        const errCode = data?.error;
        if (errCode === "full-lobby" || errCode === "kicked") {
          this.onmessage({
            type: "error",
            error: errCode === "kicked" ? "kick_reason.lobby_creator" : errCode,
          });
          this.stop();
          return;
        }
        return;
      }

      if (data.stage === "lobby" && data.lobby) {
        this.stage = "lobby";
        this.onmessage({
          type: "lobby_info",
          myClientID: data.myClientID,
          lobby: data.lobby,
        });
        return;
      }

      // Game has started!
      this.stage = data.stage;
      const safeTurn =
        typeof data.safeTurn === "number" ? data.safeTurn : -1;
      const intentsByTurn = data.intentsByTurn ?? {};

      if (!this.emittedStart && data.gameStartInfo) {
        const initialTurns: Turn[] = [];
        for (let t = 0; t <= safeTurn; t++) {
          initialTurns.push({
            turnNumber: t,
            intents: intentsByTurn[String(t)] ?? [],
          });
        }
        this.nextFetchTurn = safeTurn + 1;
        this.nextDeliverTurn = safeTurn + 1;
        this.verifiedTurns.clear();
        this.emittedStart = true;

        this.onmessage({
          type: "prestart",
          gameMap: data.gameStartInfo.config.gameMap,
          gameMapSize: data.gameStartInfo.config.gameMapSize,
        });
        this.onmessage({
          type: "start",
          gameStartInfo: data.gameStartInfo,
          turns: initialTurns,
          lobbyCreatedAt:
            data.lobbyCreatedAt ?? data.gameStartInfo.lobbyCreatedAt,
          myClientID: data.myClientID,
        });
      } else if (safeTurn >= this.nextFetchTurn) {
        for (let t = this.nextFetchTurn; t <= safeTurn; t++) {
          this.verifiedTurns.set(t, {
            turnNumber: t,
            intents: intentsByTurn[String(t)] ?? [],
          });
        }
        this.nextFetchTurn = safeTurn + 1;
      }

      if (
        data.successorId &&
        data.successorId !== this.emittedSuccessorId
      ) {
        this.emittedSuccessorId = data.successorId;
        this.onmessage({
          type: "new_lobby",
          gameID: data.successorId,
        });
      }
    } catch (err) {
      if (intentsBatch.length > 0) {
        this.queuedIntents.unshift(...intentsBatch);
      }
      console.warn("HTTP multiplayer sync error:", err);
    } finally {
      this.syncInFlight = false;
      if (!this.stopped) {
        if (this.pendingFlush || this.queuedIntents.length > 0) {
          this.pendingFlush = false;
          this.triggerImmediateSync();
        } else {
          this.scheduleNextPoll();
        }
      }
    }
  }
}
