import {
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { maxCivilianPopulation } from "@openfront/engine-lib/configuration/CrownfallConfig";
import {
  applyFoodToPopulationGrowth,
  computeFoodBreakdown,
  computeFoodStabilityDelta,
  CROWNFALL_FOOD_CONFIG,
} from "@openfront/engine-lib/configuration/CrownfallFood";
import { ConstructionExecution } from "@openfront/engine/execution/ConstructionExecution";
import { SpawnExecution } from "@openfront/engine/execution/SpawnExecution";
import { Game } from "@openfront/engine/game/Game";
import { describe, expect, test } from "vitest";
import { setup } from "../util/Setup";
import { expectSnapshotRoundTrip } from "../util/Snapshot";
import { executeTicks } from "../util/utils";

async function createFoodGame(disableFood = false): Promise<Game> {
  const pInfo = new PlayerInfo("Agrarian", PlayerType.Human, "c1", "p1");
  const game = await setup(
    "plains",
    {
      instantBuild: true,
      startingGold: 5_000_000,
      ...(disableFood ? { disableFood: true } : {}),
    },
    [pInfo],
    undefined,
    undefined,
    false,
  );
  game.addExecution(new SpawnExecution("test-food", pInfo, game.ref(20, 20)));
  executeTicks(game, 105);
  return game;
}

describe("Crownfall Expansion Phase 1: Food Economy", () => {
  test("spawns with starting food reserves and grows population during food surplus", async () => {
    const game = await createFoodGame(false);
    const p1 = game.player("p1");

    expect(p1.food()).toBeGreaterThanOrEqual(CROWNFALL_FOOD_CONFIG.startingFood);
    const popBefore = p1.civilianPopulation();
    executeTicks(game, 30);
    expect(p1.civilianPopulation()).toBeGreaterThan(popBefore);
  });

  test("severe food shortage (famine) causes population decline and stability drop", async () => {
    const game = await createFoodGame(false);
    const p1 = game.player("p1");

    // Inflate civilian population so food consumption exceeds baseline production, and drain reserves
    p1.addCivilianPopulation(150_000);
    p1.setFood(0);

    const fb = computeFoodBreakdown(p1, p1.civilianPopulation(), p1.food());
    expect(fb.status).toBe("famine");
    expect(computeFoodStabilityDelta(fb)).toBe(
      CROWNFALL_FOOD_CONFIG.famineStabilityPenalty,
    );
    expect(applyFoodToPopulationGrowth(200, p1.civilianPopulation(), fb)).toBeLessThan(0);

    const popBefore = p1.civilianPopulation();
    const stabBefore = p1.stability();
    executeTicks(game, 40);
    expect(p1.civilianPopulation()).toBeLessThan(popBefore);
    expect(p1.stability()).toBeLessThan(stabBefore);
  });

  test("disableFood pre-game setting bypasses food depletion and famine penalties", async () => {
    const game = await createFoodGame(true);
    const p1 = game.player("p1");

    p1.setFood(0);
    const popBefore = p1.civilianPopulation();
    const stabBefore = p1.stability();
    executeTicks(game, 30);
    // Even with 0 food, population grows normally and stability has zero famine penalty when disableFood is true
    expect(p1.food()).toBe(0);
    expect(p1.civilianPopulation()).toBeGreaterThan(popBefore);
    expect(p1.stability()).toBeGreaterThanOrEqual(stabBefore - 5);
  });

  test("PlayerSnapshot v7 round-trip preserves food reserves and warning band byte-identically", async () => {
    const game = await createFoodGame(false);
    const p1 = game.player("p1");
    p1.setFood(3_210);
    executeTicks(game, 20);
    await expectSnapshotRoundTrip(game, "plains", 20);
  });

  test("Phase 2: Farms, Bakeries, and Granaries construct, upgrade, and boost food economy & welfare", async () => {
    const game = await createFoodGame(false);
    const p1 = game.player("p1");
    for (let x = 5; x < 45; x++) {
      for (let y = 5; y < 45; y++) {
        p1.conquer(game.ref(x, y));
      }
    }

    const baseBreakdown = computeFoodBreakdown(p1, p1.civilianPopulation(), p1.food());
    const basePopCap = maxCivilianPopulation(p1);

    // Construct Farm, Bakery, and Granary on spaced tiles
    game.addExecution(new ConstructionExecution(p1, UnitType.Farm, game.ref(10, 10)));
    game.addExecution(new ConstructionExecution(p1, UnitType.Bakery, game.ref(35, 10)));
    game.addExecution(new ConstructionExecution(p1, UnitType.Granary, game.ref(10, 35)));
    executeTicks(game, 5);

    // Upgrade Farm at same tile
    const farmUnit = p1.units(UnitType.Farm)[0];
    expect(farmUnit).toBeDefined();
    p1.upgradeUnit(farmUnit);
    expect(farmUnit.level()).toBe(2);

    const nextBreakdown = computeFoodBreakdown(p1, p1.civilianPopulation(), p1.food());
    expect(nextBreakdown.productionPerMin).toBeGreaterThan(
      baseBreakdown.productionPerMin + 2_000,
    );
    expect(nextBreakdown.maxStorage).toBe(
      baseBreakdown.maxStorage + CROWNFALL_FOOD_CONFIG.granaryCapPerLevel,
    );
    expect(maxCivilianPopulation(p1)).toBe(basePopCap + 80_000);
    expect(computeFoodStabilityDelta(nextBreakdown, 1)).toBeGreaterThanOrEqual(
      CROWNFALL_FOOD_CONFIG.bakeryStabilityPerLevel,
    );
  });
});
