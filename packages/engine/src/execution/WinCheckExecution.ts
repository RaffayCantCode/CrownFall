import {
  ColoredTeams,
  GameMode,
  MessageType,
  PlayerID,
  PlayerType,
  RankedType,
  Team,
} from "@openfront/engine-api/game/GameTypes";
import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import { z } from "zod";
import { Execution, Game, Player } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type { ExecRecord, SnapshotReader } from "../snapshot/SnapshotContext";

export class WinCheckExecution implements Execution {
  private active = true;

  private mg: Game | null = null;

  private checkedRankedSpawns = false;

  // Phase 7: Stable Hegemony countdown state.
  private hegemonyHolderPlayerId: PlayerID | null = null;
  private hegemonyHolderTeam: Team | null = null;
  private hegemonyHeldSeconds = 0;
  private hegemonyStalled = false;
  private hegemonyDecaying = false;
  private hegemonyActive = false;

  // Hard time limit (in seconds) to force a winner before the server's
  // maxGameDuration hard kill. 170mins (10 mins before 3hrs)
  private static readonly HARD_TIME_LIMIT_SECONDS = 170 * 60;

  constructor() {}

  init(mg: Game, ticks: number) {
    this.mg = mg;
  }

  tick(ticks: number) {
    if (ticks % 10 !== 0) {
      return;
    }
    if (this.mg === null) throw new Error("Not initialized");

    if (this.checkRankedTeamCancelled()) {
      return;
    }

    if (this.mg.config().gameConfig().gameMode === GameMode.FFA) {
      this.checkWinnerFFA();
    } else {
      this.checkWinnerTeam();
    }
  }

  // A ranked 2v2 or clan wars match is void unless every matched player
  // actually spawned — a player who never joined isn't in the game at all, and
  // one who idled through the spawn phase never placed a spawn. Either way the
  // match would be lopsided, so end it with no winner (the record is archived
  // winnerless and never ranked). Runs once, on the first check after the
  // spawn phase ends (this execution is inactive during the spawn phase).
  private checkRankedTeamCancelled(): boolean {
    if (this.mg === null) throw new Error("Not initialized");
    if (this.checkedRankedSpawns) {
      return false;
    }
    this.checkedRankedSpawns = true;
    const gameConfig = this.mg.config().gameConfig();
    if (!isRankedTeamGame(gameConfig.rankedType)) {
      return false;
    }
    // allPlayers: players() hides tile-less players, which is exactly what a
    // never-spawned player is.
    const spawned = this.mg
      .allPlayers()
      .filter((p) => p.type() === PlayerType.Human && p.hasSpawned()).length;
    const expected = gameConfig.maxPlayers ?? 0;
    if (spawned >= expected) {
      return false;
    }
    console.log(
      `ranked ${gameConfig.rankedType} cancelled: only ${spawned}/${expected} players spawned`,
    );
    this.mg.setWinner(null, this.mg.stats().stats());
    this.active = false;
    return true;
  }

  checkWinnerFFA(): void {
    if (this.mg === null) throw new Error("Not initialized");
    const sorted = this.mg
      .players()
      .sort((a, b) => b.numTilesOwned() - a.numTilesOwned());
    if (sorted.length === 0) {
      return;
    }

    // The tutorial is won by conquering its two nations, and
    // nothing else ends it: no tile share, no timer.
    if (this.mg.config().gameConfig().tutorial) {
      if (sorted.every((p) => p.type() === PlayerType.Human)) {
        this.mg.setWinner(sorted[0], this.mg.stats().stats());
        this.active = false;
      }
      return;
    }

    // Ranked 1v1 and FFA end when one connected human is left: everyone else
    // is dead or gone.
    const rankedType = this.mg.config().gameConfig().rankedType;
    if (
      rankedType === RankedType.OneVOne ||
      rankedType === RankedType.FreeForAll
    ) {
      const humans = sorted.filter(
        (p) => p.type() === PlayerType.Human && !p.isDisconnected(),
      );
      if (humans.length === 1) {
        this.clearHegemonyIfActive();
        this.mg.setWinner(humans[0], this.mg.stats().stats());
        console.log(`${humans[0].name()} has won the game`);
        this.active = false;
        return;
      }
    }

    // A bot can't win ranked FFA: the API only rates a winner who was in the
    // match, so the largest human takes the threshold or the timer. Ranked 1v1
    // keeps the old rule so archived 1v1 replays still resolve the same way.
    const contenders =
      rankedType === RankedType.FreeForAll
        ? sorted.filter((p) => p.type() === PlayerType.Human)
        : sorted;
    const max = contenders[0];
    if (max === undefined) {
      return;
    }

    // Timer / hard time limit resolves immediately.
    if (this.hasTimedOut()) {
      this.clearHegemonyIfActive();
      this.mg.setWinner(max, this.mg.stats().stats());
      console.log(`${max.name()} has won the game`);
      this.active = false;
      return;
    }

    const hegemonyCfg = this.mg.config().stableHegemonyConfig();
    if (this.hasTerritoryThreshold(max.numTilesOwned())) {
      // Uncontested (no other alive nations) or Stable Hegemony disabled -> immediate win.
      if (!hegemonyCfg.enabled || sorted.length <= 1) {
        this.clearHegemonyIfActive();
        this.mg.setWinner(max, this.mg.stats().stats());
        console.log(`${max.name()} has won the game`);
        this.active = false;
        return;
      }

      this.stepHegemonyFFA(max, hegemonyCfg);
      return;
    }

    this.decayHegemonyFFA(hegemonyCfg);
  }

  private hasTimedOut(): boolean {
    if (this.mg === null) throw new Error("Not initialized");
    const timeElapsed = this.mg.elapsedGameSeconds();
    // null (host lobby, timer off) means no timer, same as undefined.
    const maxTimerValue = this.mg.config().gameConfig().maxTimerValue;
    if (
      maxTimerValue !== undefined &&
      maxTimerValue !== null &&
      timeElapsed >= maxTimerValue * 60
    ) {
      return true;
    }
    return timeElapsed >= WinCheckExecution.HARD_TIME_LIMIT_SECONDS;
  }

  private hasTerritoryThreshold(tilesOwned: number): boolean {
    if (this.mg === null) throw new Error("Not initialized");
    const timeElapsed = this.mg.elapsedGameSeconds();
    const numTilesWithoutFallout =
      this.mg.numLandTiles() - this.mg.numTilesWithFallout();
    // Cross-multiplied: the threshold is in whole tenths of a percent, so
    // this is exact integer math.
    return (
      tilesOwned * 1000 >
      numTilesWithoutFallout *
        this.mg.config().percentageTilesOwnedToWinTenths(timeElapsed)
    );
  }

  private stepHegemonyFFA(
    leader: Player,
    cfg: { holdSeconds: number; minStability: number; decayPerSecond: number },
  ): void {
    if (this.mg === null) throw new Error("Not initialized");
    const stability = leader.stability();
    const isSameHolder = this.hegemonyHolderPlayerId === leader.id();

    if (stability >= cfg.minStability) {
      const wasActiveSame = isSameHolder && this.hegemonyHeldSeconds > 0;
      this.hegemonyHolderPlayerId = leader.id();
      this.hegemonyHolderTeam = null;
      this.hegemonyHeldSeconds = isSameHolder ? this.hegemonyHeldSeconds + 1 : 1;
      this.hegemonyStalled = false;
      this.hegemonyDecaying = false;
      this.hegemonyActive = true;

      if (!wasActiveSame && this.hegemonyHeldSeconds === 1) {
        this.mg.displayMessage(
          "crownfall.hegemony_started",
          MessageType.ALLIANCE_ACCEPTED,
          null,
          undefined,
          { name: leader.displayName(), seconds: cfg.holdSeconds },
        );
      }

      if (this.hegemonyHeldSeconds >= cfg.holdSeconds) {
        this.clearHegemonyIfActive();
        this.mg.setWinner(leader, this.mg.stats().stats());
        console.log(`${leader.name()} achieved Stable Hegemony victory`);
        this.active = false;
        return;
      }

      this.emitHegemonyUpdate({
        active: true,
        holderPlayerID: leader.smallID(),
        holderTeam: null,
        holderName: leader.displayName(),
        heldSeconds: this.hegemonyHeldSeconds,
        requiredSeconds: cfg.holdSeconds,
        stability,
        minStability: cfg.minStability,
        stalled: false,
        decaying: false,
      });
    } else {
      // Owns the land, but Stability is below the required floor -> stalled!
      this.hegemonyHolderPlayerId = leader.id();
      this.hegemonyHolderTeam = null;
      this.hegemonyHeldSeconds = isSameHolder
        ? Math.max(0, this.hegemonyHeldSeconds - cfg.decayPerSecond)
        : 0;
      this.hegemonyStalled = true;
      this.hegemonyDecaying = false;
      this.hegemonyActive = true;

      this.emitHegemonyUpdate({
        active: true,
        holderPlayerID: leader.smallID(),
        holderTeam: null,
        holderName: leader.displayName(),
        heldSeconds: this.hegemonyHeldSeconds,
        requiredSeconds: cfg.holdSeconds,
        stability,
        minStability: cfg.minStability,
        stalled: true,
        decaying: false,
      });
    }
  }

  private decayHegemonyFFA(cfg: {
    holdSeconds: number;
    minStability: number;
    decayPerSecond: number;
  }): void {
    if (this.mg === null || !this.hegemonyActive) return;

    if (this.hegemonyHeldSeconds > 0 && this.hegemonyHolderPlayerId !== null) {
      this.hegemonyHeldSeconds = Math.max(
        0,
        this.hegemonyHeldSeconds - cfg.decayPerSecond,
      );
      if (this.hegemonyHeldSeconds === 0) {
        this.clearHegemonyIfActive();
        return;
      }
      const holder = this.mg.hasPlayer(this.hegemonyHolderPlayerId)
        ? this.mg.player(this.hegemonyHolderPlayerId)
        : null;
      if (!holder || !holder.isAlive()) {
        this.clearHegemonyIfActive();
        return;
      }
      this.hegemonyStalled = false;
      this.hegemonyDecaying = true;
      this.emitHegemonyUpdate({
        active: true,
        holderPlayerID: holder.smallID(),
        holderTeam: null,
        holderName: holder.displayName(),
        heldSeconds: this.hegemonyHeldSeconds,
        requiredSeconds: cfg.holdSeconds,
        stability: holder.stability(),
        minStability: cfg.minStability,
        stalled: false,
        decaying: true,
      });
    } else {
      this.clearHegemonyIfActive();
    }
  }

  private teamWeightedStability(team: Team): number {
    if (this.mg === null) return 0;
    let weightedSum = 0;
    let totalTiles = 0;
    for (const p of this.mg.players()) {
      if (p.team() !== team) continue;
      const tiles = p.numTilesOwned();
      weightedSum += p.stability() * tiles;
      totalTiles += tiles;
    }
    if (totalTiles <= 0) return 0;
    return Math.floor(weightedSum / totalTiles);
  }

  private stepHegemonyTeam(
    team: Team,
    cfg: { holdSeconds: number; minStability: number; decayPerSecond: number },
  ): void {
    if (this.mg === null) throw new Error("Not initialized");
    const stability = this.teamWeightedStability(team);
    const isSameHolder = this.hegemonyHolderTeam === team;

    if (stability >= cfg.minStability) {
      const wasActiveSame = isSameHolder && this.hegemonyHeldSeconds > 0;
      this.hegemonyHolderPlayerId = null;
      this.hegemonyHolderTeam = team;
      this.hegemonyHeldSeconds = isSameHolder ? this.hegemonyHeldSeconds + 1 : 1;
      this.hegemonyStalled = false;
      this.hegemonyDecaying = false;
      this.hegemonyActive = true;

      if (!wasActiveSame && this.hegemonyHeldSeconds === 1) {
        this.mg.displayMessage(
          "crownfall.hegemony_started",
          MessageType.ALLIANCE_ACCEPTED,
          null,
          undefined,
          { name: String(team), seconds: cfg.holdSeconds },
        );
      }

      if (this.hegemonyHeldSeconds >= cfg.holdSeconds) {
        this.clearHegemonyIfActive();
        this.mg.setWinner(team, this.mg.stats().stats());
        console.log(`${team} achieved Stable Hegemony victory`);
        this.active = false;
        return;
      }

      this.emitHegemonyUpdate({
        active: true,
        holderPlayerID: null,
        holderTeam: team,
        holderName: String(team),
        heldSeconds: this.hegemonyHeldSeconds,
        requiredSeconds: cfg.holdSeconds,
        stability,
        minStability: cfg.minStability,
        stalled: false,
        decaying: false,
      });
    } else {
      this.hegemonyHolderPlayerId = null;
      this.hegemonyHolderTeam = team;
      this.hegemonyHeldSeconds = isSameHolder
        ? Math.max(0, this.hegemonyHeldSeconds - cfg.decayPerSecond)
        : 0;
      this.hegemonyStalled = true;
      this.hegemonyDecaying = false;
      this.hegemonyActive = true;

      this.emitHegemonyUpdate({
        active: true,
        holderPlayerID: null,
        holderTeam: team,
        holderName: String(team),
        heldSeconds: this.hegemonyHeldSeconds,
        requiredSeconds: cfg.holdSeconds,
        stability,
        minStability: cfg.minStability,
        stalled: true,
        decaying: false,
      });
    }
  }

  private decayHegemonyTeam(cfg: {
    holdSeconds: number;
    minStability: number;
    decayPerSecond: number;
  }): void {
    if (this.mg === null || !this.hegemonyActive) return;

    if (this.hegemonyHeldSeconds > 0 && this.hegemonyHolderTeam !== null) {
      this.hegemonyHeldSeconds = Math.max(
        0,
        this.hegemonyHeldSeconds - cfg.decayPerSecond,
      );
      if (this.hegemonyHeldSeconds === 0) {
        this.clearHegemonyIfActive();
        return;
      }
      this.hegemonyStalled = false;
      this.hegemonyDecaying = true;
      this.emitHegemonyUpdate({
        active: true,
        holderPlayerID: null,
        holderTeam: this.hegemonyHolderTeam,
        holderName: String(this.hegemonyHolderTeam),
        heldSeconds: this.hegemonyHeldSeconds,
        requiredSeconds: cfg.holdSeconds,
        stability: this.teamWeightedStability(this.hegemonyHolderTeam),
        minStability: cfg.minStability,
        stalled: false,
        decaying: true,
      });
    } else {
      this.clearHegemonyIfActive();
    }
  }

  private clearHegemonyIfActive(): void {
    if (!this.hegemonyActive) return;
    this.hegemonyHolderPlayerId = null;
    this.hegemonyHolderTeam = null;
    this.hegemonyHeldSeconds = 0;
    this.hegemonyStalled = false;
    this.hegemonyDecaying = false;
    this.hegemonyActive = false;
    if (this.mg !== null) {
      const cfg = this.mg.config().stableHegemonyConfig();
      this.emitHegemonyUpdate({
        active: false,
        holderPlayerID: null,
        holderTeam: null,
        holderName: "",
        heldSeconds: 0,
        requiredSeconds: cfg.holdSeconds,
        stability: 0,
        minStability: cfg.minStability,
        stalled: false,
        decaying: false,
      });
    }
  }

  private emitHegemonyUpdate(payload: {
    active: boolean;
    holderPlayerID: number | null;
    holderTeam: Team | null;
    holderName: string;
    heldSeconds: number;
    requiredSeconds: number;
    stability: number;
    minStability: number;
    stalled: boolean;
    decaying: boolean;
  }): void {
    if (this.mg === null) return;
    this.mg.addUpdate({
      type: GameUpdateType.Hegemony,
      ...payload,
    });
  }

  checkWinnerTeam(): void {
    if (this.mg === null) throw new Error("Not initialized");

    if (isRankedTeamGame(this.mg.config().gameConfig().rankedType)) {
      // players() only returns alive players, so a team drops out of this set
      // once every member is dead or disconnected.
      const teamsRemaining = new Set<Team>();
      for (const player of this.mg.players()) {
        if (player.type() !== PlayerType.Human || player.isDisconnected()) {
          continue;
        }
        const team = player.team();
        if (team !== null) {
          teamsRemaining.add(team);
        }
      }
      if (teamsRemaining.size === 1) {
        const [winner] = teamsRemaining;
        this.clearHegemonyIfActive();
        this.mg.setWinner(winner, this.mg.stats().stats());
        console.log(`${winner} has won the game`);
        this.active = false;
        return;
      }
    }

    const teamToTiles = new Map<Team, number>();
    for (const player of this.mg.players()) {
      const team = player.team();
      // Sanity check, team should not be null here
      if (team === null) continue;
      teamToTiles.set(
        team,
        (teamToTiles.get(team) ?? 0) + player.numTilesOwned(),
      );
    }
    const sorted = Array.from(teamToTiles.entries()).sort(
      (a, b) => b[1] - a[1],
    );
    if (sorted.length === 0) {
      return;
    }
    const max = sorted[0];
    if (this.hasTimedOut()) {
      if (max[0] === ColoredTeams.Bot) return;
      this.clearHegemonyIfActive();
      this.mg.setWinner(max[0], this.mg.stats().stats());
      console.log(`${max[0]} has won the game`);
      this.active = false;
      return;
    }

    const hegemonyCfg = this.mg.config().stableHegemonyConfig();
    if (this.hasTerritoryThreshold(max[1])) {
      if (max[0] === ColoredTeams.Bot) return;
      if (!hegemonyCfg.enabled || sorted.length <= 1) {
        this.clearHegemonyIfActive();
        this.mg.setWinner(max[0], this.mg.stats().stats());
        console.log(`${max[0]} has won the game`);
        this.active = false;
        return;
      }
      this.stepHegemonyTeam(max[0], hegemonyCfg);
      return;
    }

    this.decayHegemonyTeam(hegemonyCfg);
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(): ExecRecord {
    return WinCheckExecutionSnapshot.write({
      active: this.active,
      initialized: this.mg !== null,
      checkedRankedSpawns: this.checkedRankedSpawns,
      hegemonyHolderPlayerId: this.hegemonyHolderPlayerId,
      hegemonyHolderTeam: this.hegemonyHolderTeam,
      hegemonyHeldSeconds: this.hegemonyHeldSeconds,
      hegemonyStalled: this.hegemonyStalled,
      hegemonyDecaying: this.hegemonyDecaying,
      hegemonyActive: this.hegemonyActive,
    });
  }

  restoreSnapshot(s: WinCheckState, r: SnapshotReader): void {
    this.active = s.active;
    this.mg = s.initialized ? r.game : null;
    this.checkedRankedSpawns = s.checkedRankedSpawns;
    this.hegemonyHolderPlayerId = s.hegemonyHolderPlayerId;
    this.hegemonyHolderTeam = s.hegemonyHolderTeam as Team | null;
    this.hegemonyHeldSeconds = s.hegemonyHeldSeconds;
    this.hegemonyStalled = s.hegemonyStalled;
    this.hegemonyDecaying = s.hegemonyDecaying;
    this.hegemonyActive = s.hegemonyActive;
  }
}

// Ranked team modes: matchmade teams that must all show up, and that win by
// outlasting every other team.
function isRankedTeamGame(rankedType: RankedType | undefined): boolean {
  return (
    rankedType === RankedType.TwoVTwo || rankedType === RankedType.ClanWars
  );
}

const WinCheckStateSchema = z.object({
  active: z.boolean(),
  initialized: z.boolean(),
  checkedRankedSpawns: z.boolean(),
  hegemonyHolderPlayerId: z.string().nullable(),
  hegemonyHolderTeam: z.string().nullable(),
  hegemonyHeldSeconds: z.number(),
  hegemonyStalled: z.boolean(),
  hegemonyDecaying: z.boolean(),
  hegemonyActive: z.boolean(),
});
type WinCheckState = z.infer<typeof WinCheckStateSchema>;

export const WinCheckExecutionSnapshot = execSnapshotType({
  name: "WinCheck",
  version: 2,
  schema: WinCheckStateSchema,
  migrations: {
    1: (old: Record<string, unknown>) => ({
      ...old,
      hegemonyHolderPlayerId: null,
      hegemonyHolderTeam: null,
      hegemonyHeldSeconds: 0,
      hegemonyStalled: false,
      hegemonyDecaying: false,
      hegemonyActive: false,
    }),
  },
  cls: () => WinCheckExecution,
});
