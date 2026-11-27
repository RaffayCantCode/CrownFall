import {
  BountyRewardType,
  PlayerInfo,
  PlayerType,
} from "@openfront/engine-api/game/GameTypes";
import { CROWNFALL_BOUNTY_CONFIG } from "@openfront/engine-lib/configuration/CrownfallBounties";
import { SpawnExecution } from "@openfront/engine/execution/SpawnExecution";
import { Game, Player } from "@openfront/engine/game/Game";
import { describe, expect, test } from "vitest";
import { setup } from "../util/Setup";
import { expectSnapshotRoundTrip } from "../util/Snapshot";
import { executeTicks } from "../util/utils";

async function createBountyGame(disableBounties = false): Promise<Game> {
  const p1Info = new PlayerInfo("HunterHuman", PlayerType.Human, "c1", "p1");
  const p2Info = new PlayerInfo("TargetNation", PlayerType.Nation, null, "p2");
  const p3Info = new PlayerInfo("RivalNation", PlayerType.Nation, null, "p3");

  const game = await setup(
    "plains",
    {
      instantBuild: true,
      startingGold: 500_000,
      disablePaths: true,
      disableAugments: true,
      ...(disableBounties ? { disableBounties: true } : {}),
    },
    [p1Info, p2Info, p3Info],
    undefined,
    undefined,
    false,
  );

  game.addExecution(new SpawnExecution("test-bounty", p1Info, game.ref(10, 10)));
  game.addExecution(new SpawnExecution("test-bounty", p2Info, game.ref(25, 25)));
  game.addExecution(new SpawnExecution("test-bounty", p3Info, game.ref(42, 42)));
  executeTicks(game, 105);

  // Ensure all 3 countries hold >= 49 tiles (>= minEligibleTargetTiles = 25)
  const expandBox = (player: Player, cx: number, cy: number) => {
    for (let x = cx - 3; x <= cx + 3; x++) {
      for (let y = cy - 3; y <= cy + 3; y++) {
        player.conquer(game.ref(x, y));
      }
    }
  };
  expandBox(game.player("p1"), 10, 10);
  expandBox(game.player("p2"), 25, 25);
  expandBox(game.player("p3"), 42, 42);

  return game;
}

function captureSnapshotOfResources(p: Player) {
  return {
    gold: p.gold(),
    troops: p.troops(),
    civs: p.civilianPopulation(),
    food: p.food(),
    sci: p.science(),
    atkSpd: p.pathModifiers().attackSpeedPercent,
    taxPct: p.pathModifiers().civilianTaxPercent,
  };
}

function didReceiveAnyBountyReward(
  before: ReturnType<typeof captureSnapshotOfResources>,
  after: ReturnType<typeof captureSnapshotOfResources>,
): boolean {
  return (
    after.gold > before.gold ||
    after.troops > before.troops ||
    after.civs > before.civs ||
    after.food > before.food ||
    after.sci > before.sci ||
    after.atkSpd > before.atkSpd ||
    after.taxPct > before.taxPct
  );
}

describe("Crownfall Expansion Phase 4: International Bounty Events", () => {
  test("stays inactive in early game, activates after firstBountyDelayTicks, and expires cleanly without reward if target survives", async () => {
    const game = await createBountyGame(false);

    // Still in early game (< 2400 active gameplay ticks)
    executeTicks(game, 500);
    expect(game.activeBountyTargetID()).toBeNull();

    // Advance past firstBountyDelayTicks (2400 total active ticks)
    executeTicks(game, CROWNFALL_BOUNTY_CONFIG.firstBountyDelayTicks);
    const activeTargetID = game.activeBountyTargetID();
    expect(activeTargetID).not.toBeNull();
    expect(["p1", "p2", "p3"]).toContain(activeTargetID);

    // Snapshot v6 + PlayerSnapshot v8 round-trip while bounty and temporary buff are active
    game
      .player("p1")
      .grantBountyBuff(BountyRewardType.MilitaryEfficiency, 300);
    expect(game.player("p1").pathModifiers().attackSpeedPercent).toBeGreaterThan(
      100,
    );
    await expectSnapshotRoundTrip(game, "plains", 10);

    // Let the target survive until bountyDurationTicks expires -> ends with no reward
    executeTicks(game, CROWNFALL_BOUNTY_CONFIG.bountyDurationTicks + 20);
    expect(game.activeBountyTargetID()).toBeNull();
  });

  test("credits top tile-conquering contributor over 1-tile kill-stealer and supports AI Nation claimants", async () => {
    const game = await createBountyGame(false);
    const p1 = game.player("p1"); // Human
    const p2 = game.player("p2"); // Target Nation
    const p3 = game.player("p3"); // Rival AI Nation

    expect(game.triggerBountyEvent(p2)).toBe(true);
    expect(game.activeBountyTargetID()).toBe(p2.id());

    // AI Nation p3 conquers almost all of p2's territory during the bounty window,
    // while p1 snipes only the very last tile (< 25% of bounty tiles).
    const targetTiles = Array.from(p2.tiles());
    expect(targetTiles.length).toBeGreaterThan(30);

    for (let i = 0; i < targetTiles.length - 1; i++) {
      p3.conquer(targetTiles[i]);
    }
    const p3Before = captureSnapshotOfResources(p3);

    // p1 takes the final 1 tile and triggers elimination
    p1.conquer(targetTiles[targetTiles.length - 1]);
    game.conquerPlayer(p1, p2);

    const p3After = captureSnapshotOfResources(p3);
    expect(game.activeBountyTargetID()).toBeNull();
    // AI Nation p3 did >95% of the conquest work so p3 claims the random bounty reward!
    expect(didReceiveAnyBountyReward(p3Before, p3After)).toBe(true);
  });

  test("prevents friendly/allied exploitation and respects disableBounties pre-game setting", async () => {
    const game = await createBountyGame(false);
    const p1 = game.player("p1");
    const p2 = game.player("p2");

    // Form an alliance between p1 and p2
    const req = p1.createAllianceRequest(p2)!;
    req.accept();
    expect(p1.isAlliedWith(p2)).toBe(true);

    expect(game.triggerBountyEvent(p2)).toBe(true);

    // Friendly/allied conquest must NOT grant a bounty reward
    p2.removeGold(p2.gold());
    for (const t of Array.from(p2.tiles())) {
      p1.conquer(t);
    }
    const p1Before = captureSnapshotOfResources(p1);
    game.conquerPlayer(p1, p2);
    const p1After = captureSnapshotOfResources(p1);
    expect(didReceiveAnyBountyReward(p1Before, p1After)).toBe(false);
    expect(game.activeBountyTargetID()).toBeNull();

    // Verify disableBounties: true blocks both automatic and manual bounty events
    const disabledGame = await createBountyGame(true);
    expect(disabledGame.triggerBountyEvent()).toBe(false);
    executeTicks(
      disabledGame,
      CROWNFALL_BOUNTY_CONFIG.firstBountyDelayTicks + 100,
    );
    expect(disabledGame.activeBountyTargetID()).toBeNull();
  });
});
