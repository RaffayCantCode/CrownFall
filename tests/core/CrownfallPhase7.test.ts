import {
  GameMode,
  PlayerInfo,
  PlayerType,
} from "@openfront/engine-api/game/GameTypes";
import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import { WinCheckExecution } from "@openfront/engine/execution/WinCheckExecution";
import type { Game, Player } from "@openfront/engine/game/Game";
import { describe, expect, test } from "vitest";
import { expectSnapshotRoundTrip } from "../util/Snapshot";
import { setup } from "../util/Setup";

function assignLandTiles(
  game: Game,
  allocations: Array<{ player: Player; count: number }>,
): void {
  let idx = 0;
  let assignedInBucket = 0;
  game.map().forEachTile((tile) => {
    if (!game.map().isLand(tile)) return;
    while (idx < allocations.length && assignedInBucket >= allocations[idx].count) {
      idx++;
      assignedInBucket = 0;
    }
    if (idx >= allocations.length) return;
    allocations[idx].player.conquer(tile);
    assignedInBucket++;
  });
}

describe("Crownfall Phase 7: Revised Endgame & Stable Hegemony Victory", () => {
  test("crossing territory threshold with opponents alive requires holding Stable Hegemony for holdSeconds", async () => {
    const game = await setup("big_plains", {
      gameMode: GameMode.FFA,
      infiniteGold: true,
      instantBuild: true,
      stableHegemony: { enabled: true, holdSeconds: 5, minStability: 50 },
    });

    game.addPlayer(new PlayerInfo("Empire", PlayerType.Human, "HUMAN00001", "emp_1"));
    game.addPlayer(new PlayerInfo("Rebel", PlayerType.Human, "HUMAN00002", "reb_2"));
    const emp = game.player("emp_1");
    const reb = game.player("reb_2");
    game.endSpawnPhase();

    const totalLand = game.numLandTiles();
    assignLandTiles(game, [
      { player: emp, count: Math.ceil(totalLand * 0.85) },
      { player: reb, count: 25 },
    ]);
    emp.setStability(75);

    const winCheck = new WinCheckExecution();
    winCheck.init(game, 0);

    // 4 seconds held: active countdown, no winner yet
    for (let s = 1; s <= 4; s++) {
      winCheck.checkWinnerFFA();
      expect(game.getWinner()).toBeNull();
      expect(winCheck.isActive()).toBe(true);
    }

    // 5th second completes Stable Hegemony victory
    winCheck.checkWinnerFFA();
    expect(game.getWinner()).toBe(emp);
    expect(winCheck.isActive()).toBe(false);
  });

  test("stability below 50% stalls Stable Hegemony and decays countdown progress", async () => {
    const game = await setup("big_plains", {
      gameMode: GameMode.FFA,
      infiniteGold: true,
      instantBuild: true,
      stableHegemony: { enabled: true, holdSeconds: 5, minStability: 50 },
    });

    game.addPlayer(new PlayerInfo("Empire", PlayerType.Human, "HUMAN00001", "emp_1"));
    game.addPlayer(new PlayerInfo("Rival", PlayerType.Human, "HUMAN00002", "riv_2"));
    const emp = game.player("emp_1");
    const riv = game.player("riv_2");
    game.endSpawnPhase();

    const totalLand = game.numLandTiles();
    assignLandTiles(game, [
      { player: emp, count: Math.ceil(totalLand * 0.85) },
      { player: riv, count: 25 },
    ]);

    const winCheck = new WinCheckExecution();
    winCheck.init(game, 0);

    // Hold stably for 3 seconds
    emp.setStability(70);
    winCheck.checkWinnerFFA();
    winCheck.checkWinnerFFA();
    winCheck.checkWinnerFFA();
    expect(game.getWinner()).toBeNull();

    // Crash stability to 30% -> stalled & decays by 2s/s (3 -> 1 -> 0)
    emp.setStability(30);
    winCheck.checkWinnerFFA();
    winCheck.checkWinnerFFA();
    expect(game.getWinner()).toBeNull();
    expect(winCheck.isActive()).toBe(true);

    // Restore stability to 60%: must rebuild full 5 seconds (1..4 no win, 5 wins)
    emp.setStability(60);
    for (let s = 1; s <= 4; s++) {
      winCheck.checkWinnerFFA();
      expect(game.getWinner()).toBeNull();
    }
    winCheck.checkWinnerFFA();
    expect(game.getWinner()).toBe(emp);
  });

  test("losing territory below threshold decays hegemony and clears banner", async () => {
    const game = await setup("big_plains", {
      gameMode: GameMode.FFA,
      infiniteGold: true,
      instantBuild: true,
      stableHegemony: { enabled: true, holdSeconds: 6, minStability: 50 },
    });

    game.addPlayer(new PlayerInfo("Empire", PlayerType.Human, "HUMAN00001", "emp_1"));
    game.addPlayer(new PlayerInfo("Rival", PlayerType.Human, "HUMAN00002", "riv_2"));
    const emp = game.player("emp_1");
    const riv = game.player("riv_2");
    game.endSpawnPhase();

    const totalLand = game.numLandTiles();
    assignLandTiles(game, [
      { player: emp, count: Math.ceil(totalLand * 0.85) },
      { player: riv, count: 25 },
    ]);
    emp.setStability(80);

    const winCheck = new WinCheckExecution();
    winCheck.init(game, 0);

    // Advance 3 seconds
    winCheck.checkWinnerFFA();
    winCheck.checkWinnerFFA();
    winCheck.checkWinnerFFA();

    // Rival reclaims 20% of land -> emp drops below 80%
    let reclaimed = 0;
    const reclaimTarget = Math.ceil(totalLand * 0.2);
    game.map().forEachTile((tile) => {
      if (reclaimed >= reclaimTarget) return;
      if (game.owner(tile) === emp) {
        riv.conquer(tile);
        reclaimed++;
      }
    });

    // Decay from 3 -> 1 -> 0 (clears active banner)
    winCheck.checkWinnerFFA();
    winCheck.checkWinnerFFA();
    expect(game.getWinner()).toBeNull();
    expect(winCheck.isActive()).toBe(true);
  });

  test("Team mode evaluates territory-weighted average stability for Stable Hegemony", async () => {
    const game = await setup("big_plains", {
      gameMode: GameMode.Team,
      playerTeams: 2,
      infiniteGold: true,
      instantBuild: true,
      stableHegemony: { enabled: true, holdSeconds: 3, minStability: 50 },
    });

    game.addPlayer(new PlayerInfo("Alpha1", PlayerType.Human, "HUMAN00001", "a1"));
    game.addPlayer(new PlayerInfo("Beta1", PlayerType.Human, "HUMAN00002", "b1"));
    const a1 = game.player("a1");
    const b1 = game.player("b1");
    expect(a1.team()).not.toBe(b1.team());
    game.endSpawnPhase();

    const totalLand = game.numLandTiles();
    assignLandTiles(game, [
      { player: a1, count: Math.ceil(totalLand * 0.85) },
      { player: b1, count: 25 },
    ]);

    const winCheck = new WinCheckExecution();
    winCheck.init(game, 0);

    // Below 50% stability -> stalled even after 5 checks
    a1.setStability(35);
    for (let i = 0; i < 5; i++) {
      winCheck.checkWinnerTeam();
    }
    expect(game.getWinner()).toBeNull();

    // Above 50% stability -> wins on 3rd check
    a1.setStability(65);
    winCheck.checkWinnerTeam();
    winCheck.checkWinnerTeam();
    expect(game.getWinner()).toBeNull();
    winCheck.checkWinnerTeam();
    expect(game.getWinner()).toBe(a1.team());
  });

  test("WinCheckExecutionSnapshot v2 preserves mid-countdown hegemony state byte-identically", async () => {
    const game = await setup("plains", {
      gameMode: GameMode.FFA,
      infiniteGold: true,
      instantBuild: true,
      stableHegemony: { enabled: true, holdSeconds: 10, minStability: 50 },
    });

    game.addPlayer(new PlayerInfo("Empire", PlayerType.Human, "HUMAN00001", "emp_1"));
    game.addPlayer(new PlayerInfo("Rival", PlayerType.Human, "HUMAN00002", "riv_2"));
    const emp = game.player("emp_1");
    const riv = game.player("riv_2");
    game.endSpawnPhase();

    const totalLand = game.numLandTiles();
    assignLandTiles(game, [
      { player: emp, count: Math.ceil(totalLand * 0.85) },
      { player: riv, count: 25 },
    ]);
    emp.setStability(80);

    const winCheck = new WinCheckExecution();
    game.addExecution(winCheck);
    // Run 30 ticks so WinCheckExecution ticks 3 times (heldSeconds = 3)
    let sawHegemonyUpdate = false;
    for (let t = 0; t < 30; t++) {
      const updates = game.executeNextTick();
      const heg = updates[GameUpdateType.Hegemony];
      if (heg && heg.length > 0 && heg[0].active) {
        sawHegemonyUpdate = true;
      }
    }
    expect(sawHegemonyUpdate).toBe(true);
    expect(game.getWinner()).toBeNull();

    await expectSnapshotRoundTrip(game, "plains");
  });
});
