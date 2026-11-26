import {
  PlayerInfo,
  PlayerType,
  TaxRate,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { IntentSchema } from "@openfront/engine-api/Schemas";
import {
  CROWNFALL_CONFIG,
  maxCivilianPopulation,
} from "@openfront/engine-lib/configuration/CrownfallConfig";
import { ConstructionExecution } from "@openfront/engine/execution/ConstructionExecution";
import { SetTaxRateExecution } from "@openfront/engine/execution/SetTaxRateExecution";
import { SpawnExecution } from "@openfront/engine/execution/SpawnExecution";
import { Game } from "@openfront/engine/game/Game";
import { describe, expect, test } from "vitest";
import { setup } from "../util/Setup";
import { expectSnapshotRoundTrip } from "../util/Snapshot";
import { executeTicks } from "../util/utils";

async function createSpawnedGame(): Promise<{
  game: Game;
  spawnTile: number;
}> {
  const humanInfo = new PlayerInfo(
    "President",
    PlayerType.Human,
    "client-1",
    "player-1",
  );
  const game = await setup(
    "plains",
    { instantBuild: true, startingGold: 5_000_000 },
    [humanInfo],
    undefined,
    undefined,
    false,
  );
  const spawnTile = game.ref(20, 20);
  game.addExecution(new SpawnExecution("test-game", humanInfo, spawnTile));
  // Advance past spawn phase
  executeTicks(game, 105);
  return { game, spawnTile };
}

describe("Crownfall Phase 1: National Management, Stability & Civilian Buildings", () => {
  test("initializes national state and grows civilian population over time", async () => {
    const { game } = await createSpawnedGame();
    const player = game.player("player-1");

    expect(player.taxRate()).toBe(TaxRate.Normal);
    expect(player.stability()).toBeGreaterThanOrEqual(0);
    expect(player.stability()).toBeLessThanOrEqual(100);

    const popBefore = player.civilianPopulation();
    executeTicks(game, 30); // 3 seconds
    expect(player.civilianPopulation()).toBeGreaterThan(popBefore);
  });

  test("SetTaxRateExecution changes tax policy and shifts stability & tax revenue", async () => {
    const { game: lowGame } = await createSpawnedGame();
    const { game: highGame } = await createSpawnedGame();

    const lowPlayer = lowGame.player("player-1");
    const highPlayer = highGame.player("player-1");

    lowGame.addExecution(new SetTaxRateExecution(lowPlayer, TaxRate.Low));
    highGame.addExecution(new SetTaxRateExecution(highPlayer, TaxRate.High));

    executeTicks(lowGame, 100); // 10 seconds
    executeTicks(highGame, 100);

    expect(lowPlayer.taxRate()).toBe(TaxRate.Low);
    expect(highPlayer.taxRate()).toBe(TaxRate.High);
    expect(lowPlayer.stability()).toBeGreaterThan(highPlayer.stability());
    expect(highPlayer.gold()).toBeGreaterThan(lowPlayer.gold());
  });

  test("Housing, Public Services, and Research Centre can be constructed and apply effects", async () => {
    const { game } = await createSpawnedGame();
    const player = game.player("player-1");
    // Give the player enough contiguous land so all three buildings satisfy structureMinDist (15)
    for (let x = 5; x < 45; x++) {
      for (let y = 5; y < 45; y++) {
        player.conquer(game.ref(x, y));
      }
    }

    const baseCap = maxCivilianPopulation(player);
    const tile1 = game.ref(10, 10);
    const tile2 = game.ref(35, 10);
    const tile3 = game.ref(10, 35);

    // Build Power Plant (UnitType.Housing) and verify cap + modifier boosts
    game.addExecution(new ConstructionExecution(player, UnitType.Housing, tile1));
    executeTicks(game, 5);
    expect(player.units(UnitType.Housing).length).toBe(1);
    expect(maxCivilianPopulation(player)).toBe(
      baseCap + CROWNFALL_CONFIG.housingPopCapPerLevel,
    );
    expect(player.pathModifiers().troopRegenPercent).toBeGreaterThan(100);

    // Orbital Radar & Cyber Command require 5 and 10 Research Centre levels
    player.addScience(5_000);
    expect(player.canBuild(UnitType.OrbitalRadar, game.ref(25, 25))).toBe(false);
    expect(player.canBuild(UnitType.CyberCommand, game.ref(25, 25))).toBe(false);

    // Build Research Centre and verify science generation
    const sciBefore = player.science();
    game.addExecution(
      new ConstructionExecution(player, UnitType.ResearchCentre, tile2),
    );
    executeTicks(game, 25); // 2.5 seconds
    expect(player.units(UnitType.ResearchCentre).length).toBe(1);
    expect(player.science()).toBeGreaterThan(sciBefore);

    // Lower stability via High taxes, then build Public Services to raise it
    player.setStability(55);
    game.addExecution(
      new ConstructionExecution(player, UnitType.PublicServices, tile3),
    );
    executeTicks(game, 5);
    expect(player.units(UnitType.PublicServices).length).toBe(1);
    executeTicks(game, 50); // 5 seconds
    expect(player.stability()).toBeGreaterThan(55);
  });

  test("SetTaxRateIntent parses cleanly via IntentSchema", () => {
    const parsed = IntentSchema.parse({
      type: "set_tax_rate",
      taxRate: TaxRate.High,
    });
    expect(parsed).toEqual({ type: "set_tax_rate", taxRate: TaxRate.High });
  });

  test("snapshot round-trip preserves national state and civilian buildings byte-identically", async () => {
    const { game } = await createSpawnedGame();
    const player = game.player("player-1");
    const tile = [...player.tiles()][0];

    game.addExecution(new SetTaxRateExecution(player, TaxRate.Low));
    game.addExecution(new ConstructionExecution(player, UnitType.ResearchCentre, tile));
    executeTicks(game, 30);

    await expectSnapshotRoundTrip(game, "plains", 30);
  });
});
