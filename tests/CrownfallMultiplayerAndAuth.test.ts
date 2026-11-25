import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { onRequestPost as postAchievements } from "../functions/api/auth/achievements";
import { onRequestPost as postLogin } from "../functions/api/auth/login";
import { onRequestPost as postRegister } from "../functions/api/auth/register";
import { onRequestPost as postCreateGame } from "../functions/api/create_game";
import {
  handleGameExists,
  handleGetLobbies,
  handleListing,
  handleMatchmaking,
  handleSync,
} from "../functions/api/_mp";
import type { PagesContext } from "../functions/api/_db";

function makeCtx(
  url: string,
  init?: RequestInit,
  cookie?: string,
): PagesContext {
  const headers = new Headers(init?.headers);
  if (cookie) headers.set("Cookie", cookie);
  return {
    request: new Request(url, { ...init, headers }),
    env: {},
  };
}

describe("Crownfall D1 Auth & Achievements Functions", () => {
  it("registers an account, logs in, and persists achievements without mentioning Cloudflare D1 in UI", async () => {
    const regRes = await postRegister(
      makeCtx("https://crownfall.pages.dev/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "commander_one",
          password: "secretpassword",
          commanderName: "Sovereign Rex",
          achievements: [{ mapName: "World", difficulty: "Hard" }],
        }),
      }),
    );
    expect(regRes.status).toBe(201);
    const setCookie = regRes.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain("crownfall_session=");
    const cookieHeader = setCookie.split(";")[0];

    const regData = (await regRes.json()) as {
      account: {
        username: string;
        commanderName: string;
        achievements: Array<{ mapName: string; difficulty: string }>;
      };
    };
    expect(regData.account.commanderName).toBe("Sovereign Rex");
    expect(regData.account.achievements).toEqual([
      { mapName: "World", difficulty: "Hard" },
    ]);

    const achRes = await postAchievements(
      makeCtx(
        "https://crownfall.pages.dev/api/auth/achievements",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            achievements: [{ mapName: "Europe", difficulty: "Impossible" }],
          }),
        },
        cookieHeader,
      ),
    );
    expect(achRes.status).toBe(200);
    const achData = (await achRes.json()) as {
      account: { achievements: Array<{ mapName: string; difficulty: string }> };
    };
    expect(achData.account.achievements).toHaveLength(2);

    const loginRes = await postLogin(
      makeCtx("https://crownfall.pages.dev/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "commander_one",
          password: "secretpassword",
        }),
      }),
    );
    expect(loginRes.status).toBe(200);
    const loginData = (await loginRes.json()) as {
      account: { achievements: Array<{ mapName: string; difficulty: string }> };
    };
    expect(loginData.account.achievements).toHaveLength(2);

    const modalSource = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "src/client/components/CrownfallAccountModal.ts",
      ),
      "utf-8",
    );
    expect(modalSource.toLowerCase()).not.toContain("cloudflare d1");
  });
});

describe("Crownfall D1 Multiplayer Engine (Lobbies, Join, Host, Lockstep & Matchmaking)", () => {
  it("schedules public FFA/Team/Special lobbies automatically", async () => {
    const res = await handleGetLobbies(
      makeCtx("https://crownfall.pages.dev/api/mp/lobbies"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      games: Record<string, Array<{ gameID: string }>>;
    };
    expect(body.games.ffa.length).toBeGreaterThanOrEqual(1);
    expect(body.games.team.length).toBeGreaterThanOrEqual(1);
    expect(body.games.special.length).toBeGreaterThanOrEqual(1);
  });

  it("creates a lobby, lists it publicly, joins 2 players, starts countdown, and relays lockstep intents", async () => {
    const hostToken = "host-uuid-1111";
    const guestToken = "guest-uuid-2222";

    const createRes = await postCreateGame(
      makeCtx("https://crownfall.pages.dev/api/create_game", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${hostToken}`,
        },
        body: JSON.stringify({}),
      }),
    );
    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as { gameID: string };
    expect(created.gameID).toMatch(/^a[A-Za-z0-9]{9}$/);
    const gameID = created.gameID;

    const existsRes = await handleGameExists(
      makeCtx(`https://crownfall.pages.dev/w0/api/game/${gameID}/exists`),
      gameID,
    );
    expect(await existsRes.json()).toEqual({ exists: true });

    // Host joins lobby
    const hostJoinRes = await handleSync(
      makeCtx("https://crownfall.pages.dev/api/mp/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join",
          gameID,
          token: hostToken,
          username: "HostCommander",
        }),
      }),
    );
    const hostJoin = (await hostJoinRes.json()) as {
      stage: string;
      myClientID: string;
      lobby: { clients: unknown[] };
    };
    expect(hostJoin.stage).toBe("lobby");
    expect(hostJoin.lobby.clients).toHaveLength(1);

    // Guest joins lobby
    const guestJoinRes = await handleSync(
      makeCtx("https://crownfall.pages.dev/api/mp/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join",
          gameID,
          token: guestToken,
          username: "GuestCommander",
        }),
      }),
    );
    const guestJoin = (await guestJoinRes.json()) as {
      stage: string;
      myClientID: string;
      lobby: { clients: unknown[] };
    };
    expect(guestJoin.lobby.clients).toHaveLength(2);
    expect(guestJoin.myClientID).not.toBe(hostJoin.myClientID);

    // Host updates config (startDelay: 0) and starts game immediately
    const startRes = await handleSync(
      makeCtx("https://crownfall.pages.dev/api/mp/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync",
          gameID,
          token: hostToken,
          intents: [
            {
              type: "update_game_config",
              config: { gameMap: "Europe", startDelay: 0 },
            },
            { type: "toggle_game_start_timer" },
          ],
        }),
      }),
    );
    const started = (await startRes.json()) as {
      stage: string;
      gameStartInfo?: {
        config: { gameMap: string };
        players: Array<{ clientID: string }>;
      };
    };
    expect(started.stage).toBe("started");
    expect(started.gameStartInfo?.config.gameMap).toBe("Europe");
    expect(started.gameStartInfo?.players).toHaveLength(2);

    // Host sends a gameplay spawn intent
    const intentRes = await handleSync(
      makeCtx("https://crownfall.pages.dev/api/mp/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync",
          gameID,
          token: hostToken,
          sinceTurn: 0,
          intents: [{ type: "spawn", tile: 42 }],
        }),
      }),
    );
    expect(intentRes.status).toBe(200);

    // Wait past the +300ms lockstep horizon and verify Guest receives Host's stamped intent
    await new Promise((r) => setTimeout(r, 350));
    const guestSyncRes = await handleSync(
      makeCtx("https://crownfall.pages.dev/api/mp/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync",
          gameID,
          token: guestToken,
          sinceTurn: 0,
        }),
      }),
    );
    const guestSync = (await guestSyncRes.json()) as {
      safeTurn: number;
      intentsByTurn: Record<string, Array<{ type: string; clientID: string; tile: number }>>;
    };
    const allRelayedIntents = Object.values(guestSync.intentsByTurn).flat();
    expect(allRelayedIntents).toContainEqual({
      type: "spawn",
      tile: 42,
      clientID: hostJoin.myClientID,
    });

    // Public listing check on another lobby
    const create2 = await (
      await postCreateGame(
        makeCtx("https://crownfall.pages.dev/api/create_game", {
          method: "POST",
          headers: { Authorization: `Bearer ${hostToken}` },
          body: "{}",
        }),
      )
    ).json();
    const listRes = await handleListing(
      makeCtx(
        `https://crownfall.pages.dev/w0/api/game/${create2.gameID}/listing`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${hostToken}`,
          },
          body: JSON.stringify({ listed: true, maxPlayers: 12 }),
        },
      ),
      create2.gameID,
    );
    expect(await listRes.json()).toEqual({ listed: true });
  });

  it("pairs two 1v1 matchmaking players into a match", async () => {
    const p1 = await (
      await handleMatchmaking(
        makeCtx("https://crownfall.pages.dev/api/mp/matchmaking", {
          method: "POST",
          body: JSON.stringify({ action: "poll", mode: "1v1", token: "mm-p1" }),
        }),
      )
    ).json();
    expect(p1).toEqual({ type: "queue-size", count: 1 });

    const p2 = (await (
      await handleMatchmaking(
        makeCtx("https://crownfall.pages.dev/api/mp/matchmaking", {
          method: "POST",
          body: JSON.stringify({ action: "poll", mode: "1v1", token: "mm-p2" }),
        }),
      )
    ).json()) as { type: string; gameId: string };
    expect(p2.type).toBe("match-assignment");
    expect(p2.gameId).toMatch(/^a[A-Za-z0-9]{9}$/);

    const p1Assigned = await (
      await handleMatchmaking(
        makeCtx("https://crownfall.pages.dev/api/mp/matchmaking", {
          method: "POST",
          body: JSON.stringify({ action: "poll", mode: "1v1", token: "mm-p1" }),
        }),
      )
    ).json();
    expect(p1Assigned).toEqual({
      type: "match-assignment",
      gameId: p2.gameId,
    });
  });
});
