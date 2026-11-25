import {
  GameType,
  PlayerInfo,
  PlayerType,
  TaxRate,
} from "@openfront/engine-api/game/GameTypes";
import {
  computeEmigrationPerSecond,
  computeNeighborMigrationShare,
  crisisTroopRegenPercent,
  CROWNFALL_CRISIS_CONFIG,
  nextRebellionMeter,
} from "@openfront/engine-lib/configuration/CrownfallCrises";
import { SpawnExecution } from "@openfront/engine/execution/SpawnExecution";
import { Game } from "@openfront/engine/game/Game";
import { describe, expect, test } from "vitest";
import { setup } from "../util/Setup";
import { expectSnapshotRoundTrip } from "../util/Snapshot";
import { executeTicks } from "../util/utils";

async function createTwoNeighborGame(): Promise<Game> {
  const p1Info = new PlayerInfo("UnstableEmpire", PlayerType.Human, "c1", "p1");
  const p2Info = new PlayerInfo("StableNeighbor", PlayerType.Human, "c2", "p2");
  const game = await setup(
    "plains",
    {
      gameType: GameType.Private,
      infiniteGold: false,
      infiniteTroops: false,
      instantBuild: true,
    },
    [p1Info, p2Info],
  );
  game.addExecution(
    new SpawnExecution("test-game", p1Info, game.ref(5, 5)),
    new SpawnExecution("test-game", p2Info, game.ref(15, 5)),
  );
  executeTicks(game, 2);
  game.endSpawnPhase();
  executeTicks(game, 2);

  const p1 = game.player("p1");
  const p2 = game.player("p2");

  // Paint two adjacent rectangular blocks so p1 and p2 share a border and p1 has >= 80 tiles.
  for (let x = 2; x < 12; x++) {
    for (let y = 2; y < 10; y++) {
      p1.conquer(game.ref(x, y));
    }
  }
  for (let x = 12; x < 20; x++) {
    for (let y = 2; y < 10; y++) {
      p2.conquer(game.ref(x, y));
    }
  }
  p1.setTroops(20_000);
  p2.setTroops(20_000);
  return game;
}

describe("Crownfall Phase 5: Internal Crises, Population Migration & Rebellions", () => {
  test("pure crisis formulas apply band penalties, emigration, migration share, and rebellion meter", () => {
    expect(crisisTroopRegenPercent(70)).toBe(100);
    expect(crisisTroopRegenPercent(45)).toBe(100);
    expect(crisisTroopRegenPercent(30)).toBe(
      CROWNFALL_CRISIS_CONFIG.crisisTroopRegenPercent,
    );
    expect(crisisTroopRegenPercent(10)).toBe(
      CROWNFALL_CRISIS_CONFIG.crisisTroopRegenPercent,
    );

    expect(computeEmigrationPerSecond(100_000, 70)).toBe(0);
    expect(computeEmigrationPerSecond(100_000, 45)).toBe(250);
    expect(computeEmigrationPerSecond(100_000, 25)).toBe(750);
    expect(computeEmigrationPerSecond(100_000, 10)).toBe(1200);

    expect(computeNeighborMigrationShare(1000, 2)).toBe(300);
    expect(computeNeighborMigrationShare(1000, 0)).toBe(0);

    // Tiny nation (< 40 tiles) decays instead of building rebellion risk
    expect(nextRebellionMeter(20, 10, 25, 0)).toBe(15);
    // Cooldown decays meter
    expect(nextRebellionMeter(20, 10, 80, 100)).toBe(15);
    // Crisis builds +3/s, Critical builds +8/s
    expect(nextRebellionMeter(10, 25, 80, 0)).toBe(13);
    expect(nextRebellionMeter(10, 10, 80, 0)).toBe(18);
  });

  test("civilians emigrate from unstable empire and migrate to stable bordering neighbor", async () => {
    const game = await createTwoNeighborGame();
    const p1 = game.player("p1");
    const p2 = game.player("p2");

    p1.addCivilianPopulation(190_000);
    p1.setStability(20); // Severe Crisis
    p1.setTaxRate(TaxRate.High);
    p2.addCivilianPopulation(40_000);
    p2.setStability(80); // Stable (>= 65)

    const p1Before = p1.civilianPopulation();
    const p2Before = p2.civilianPopulation();

    executeTicks(game, 25);

    expect(p1.civilianPopulation()).toBeLessThan(p1Before);
    expect(p2.civilianPopulation()).toBeGreaterThan(p2Before + 500);
  });

  test("sustained rebellion crisis spawns a breakaway Rebel Nation, grants relief, and starts cooldown", async () => {
    const game = await createTwoNeighborGame();
    const p1 = game.player("p1");

    const initialPlayerCount = game.players().length;
    const initialTiles = p1.numTilesOwned();
    expect(initialTiles).toBeGreaterThanOrEqual(
      CROWNFALL_CRISIS_CONFIG.minTilesForRebellion,
    );

    // Push p1 into critical instability and near-100 rebellion meter
    p1.setStability(5);
    p1.setRebellionMeter(95);
    p1.setTaxRate(TaxRate.High);

    executeTicks(game, 15);

    // A breakaway Rebel Nation should have spawned
    const rebels = game
      .players()
      .filter((p) => p.name().includes("Rebels") && p.isAlive());
    expect(rebels.length).toBe(1);
    expect(game.players().length).toBe(initialPlayerCount + 1);
    expect(rebels[0].numTilesOwned()).toBeGreaterThanOrEqual(10);
    expect(p1.numTilesOwned()).toBeLessThan(initialTiles);
    expect(p1.numTilesOwned()).toBeGreaterThanOrEqual(
      CROWNFALL_CRISIS_CONFIG.rebellionMinRemainingTiles,
    );

    // Meter reset, cooldown active, and stability relief applied
    expect(p1.rebellionMeter()).toBe(0);
    expect(p1.rebellionCooldownTicks()).toBeGreaterThan(0);
    expect(p1.stability()).toBeGreaterThanOrEqual(20);
  });

  test("tiny nations below minimum tile threshold do not suffer breakaway rebellions", async () => {
    const p1Info = new PlayerInfo("TinyState", PlayerType.Human, "c1", "p1");
    const game = await setup(
      "plains",
      {
        gameType: GameType.Private,
        infiniteGold: false,
        infiniteTroops: false,
        instantBuild: true,
      },
      [p1Info],
    );
    game.addExecution(new SpawnExecution("test-game", p1Info, game.ref(4, 4)));
    executeTicks(game, 2);
    game.endSpawnPhase();
    executeTicks(game, 2);

    const p1 = game.player("p1");
    expect(p1.numTilesOwned()).toBeLessThan(
      CROWNFALL_CRISIS_CONFIG.minTilesForRebellion,
    );

    p1.setStability(5);
    p1.setRebellionMeter(40);
    executeTicks(game, 30);

    expect(p1.rebellionMeter()).toBeLessThan(40);
    expect(game.players().filter((p) => p.name().includes("Rebels")).length).toBe(
      0,
    );
  });

  test("snapshot v5 round-trip preserves rebellionMeter and rebellionCooldownTicks byte-identically", async () => {
    const game = await createTwoNeighborGame();
    const p1 = game.player("p1");
    p1.setRebellionMeter(62);
    p1.setRebellionCooldownTicks(450);

    const restored = await expectSnapshotRoundTrip(game, "plains");
    const rp1 = restored.player("p1");

    expect(rp1.rebellionMeter()).toBe(p1.rebellionMeter());
    expect(rp1.rebellionCooldownTicks()).toBe(p1.rebellionCooldownTicks());
    expect(rp1.rebellionMeter()).toBeGreaterThan(0);
    expect(rp1.rebellionCooldownTicks()).toBeGreaterThan(0);
  });
});
