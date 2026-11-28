import {
  Cell,
  DevelopmentPath,
  Difficulty,
  Nation,
  PlayerInfo,
  PlayerType,
  TaxRate,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import {
  computeAdministrativeCapacity,
  computeMilitaryUpkeepPerSecond,
  computeStabilityBreakdown,
  CROWNFALL_CONFIG,
} from "@openfront/engine-lib/configuration/CrownfallConfig";
import {
  crisisAttackerLossPercent,
  crisisAttackSpeedPercent,
  crisisTroopRegenPercent,
} from "@openfront/engine-lib/configuration/CrownfallCrises";
import { computeFoodBreakdown } from "@openfront/engine-lib/configuration/CrownfallFood";
import { EngineConfig } from "@openfront/engine/configuration/EngineConfig";
import { AttackExecution } from "@openfront/engine/execution/AttackExecution";
import { ConstructionExecution } from "@openfront/engine/execution/ConstructionExecution";
import { NationExecution } from "@openfront/engine/execution/NationExecution";
import { SetTaxRateExecution } from "@openfront/engine/execution/SetTaxRateExecution";
import { SpawnExecution } from "@openfront/engine/execution/SpawnExecution";
import { WinCheckExecution } from "@openfront/engine/execution/WinCheckExecution";
import { Game, Player } from "@openfront/engine/game/Game";
import { describe, expect, test } from "vitest";
import { setup } from "../util/Setup";
import { expectSnapshotRoundTrip } from "../util/Snapshot";
import { executeTicks } from "../util/utils";

function paintTerritory(
  game: Game,
  player: Player,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): void {
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      if (game.isValidCoord(x, y) && game.isLand(game.ref(x, y))) {
        player.conquer(game.ref(x, y));
      }
    }
  }
}

describe("CrownFall Core Gameplay Rework: Progression, Expansion Pressure & Scenarios A–F", () => {
  test("Scenario A vs Scenario B: Aggressive Expansion vs Sustainable Development creates real early & mid-game trade-offs", async () => {
    const aggroInfo = new PlayerInfo("AggroEmpire", PlayerType.Human, "c1", "aggro");
    const sustInfo = new PlayerInfo("SustainState", PlayerType.Human, "c2", "sust");
    const targetInfo = new PlayerInfo("FrontierRival", PlayerType.Nation, null, "rival");

    // Use real EngineConfig so default National Establishment treasury (115k Gold) & real combat apply
    const game = await setup(
      "big_plains",
      {
        instantBuild: true,
        disablePaths: true,
        disableAugments: true,
      },
      [aggroInfo, sustInfo, targetInfo],
      undefined,
      EngineConfig,
      false,
    );

    game.addExecution(
      new SpawnExecution("rework-ab", aggroInfo, game.ref(15, 15)),
      new SpawnExecution("rework-ab", sustInfo, game.ref(75, 75)),
      new SpawnExecution("rework-ab", targetInfo, game.ref(32, 15)),
    );
    executeTicks(game, 105);

    const aggro = game.player("aggro");
    const sust = game.player("sust");
    const rival = game.player("rival");

    // Phase I Establishment check: default starting treasury allows ONE deliberate early investment, not everything
    expect(aggro.gold()).toBeGreaterThanOrEqual(CROWNFALL_CONFIG.defaultStartingTreasury);
    expect(aggro.gold()).toBeLessThan(250_000n);

    // Give both human nations an identical 100-tile homeland (10x10)
    paintTerritory(game, aggro, 11, 20, 11, 20);
    paintTerritory(game, rival, 21, 55, 5, 45);
    paintTerritory(game, sust, 70, 79, 70, 79);

    // Advance past 5s post-spawn window so subsequent conquests count as new expansion
    executeTicks(game, 60);

    // Scenario B: Sustainable player spends starting treasury on a Farm (75K) to secure food & growth
    game.addExecution(
      new ConstructionExecution(sust, UnitType.Farm, game.ref(74, 74)),
    );
    executeTicks(game, 5);
    expect(sust.units(UnitType.Farm).length).toBe(1);
    expect(sust.gold()).toBeLessThan(aggro.gold()); // Early economic opportunity cost!

    // Scenario A: Aggressive player immediately attacks & annexes 1,200+ tiles without building civic administration
    aggro.setTroops(95_000);
    rival.setTroops(10_000);
    game.addExecution(new AttackExecution(60_000, aggro, rival.id(), null));
    executeTicks(game, 40);
    // Annex a large swath to simulate rapid blitz conquest beyond baseAdminTiles (450)
    paintTerritory(game, aggro, 21, 52, 6, 42);

    expect(aggro.numTilesOwned()).toBeGreaterThan(1_100);
    expect(aggro.unintegratedTiles()).toBeGreaterThan(600);

    const aggroBreakdown = computeStabilityBreakdown(
      aggro,
      aggro.taxRate(),
      aggro.civilianPopulation(),
      aggro.incomingAttacks().length,
      aggro.pathModifiers(),
      0,
      aggro.outgoingAttacks().length,
      aggro.unintegratedTiles(),
      aggro.inFiscalDeficit(),
    );
    const sustBreakdown = computeStabilityBreakdown(
      sust,
      sust.taxRate(),
      sust.civilianPopulation(),
      0,
      sust.pathModifiers(),
    );

    // Reckless blitzkrieg creates substantial Expansion Pressure, while sustainable homeland has 0 strain
    expect(aggroBreakdown.overexpansion).toBeLessThanOrEqual(-12);
    expect(sustBreakdown.overexpansion).toBe(0);

    // Simulate 35 seconds: aggro suffers stability drop & troop upkeep, while sust maintains high stability & food surplus
    executeTicks(game, 350);
    expect(sust.stability()).toBeGreaterThan(aggro.stability() + 10);

    // Automatic territory integration steadily absorbs unintegrated land without manual province clicking!
    expect(aggro.unintegratedTiles()).toBeLessThan(aggro.numTilesOwned());
  });

  test("Scenario C: Economic & Civilian Neglect triggers Famine, Fiscal Deficit & Instability — and recovers via governance", async () => {
    const pInfo = new PlayerInfo("NeglectedEmpire", PlayerType.Human, "c1", "emp");
    const foeInfo = new PlayerInfo("BorderPower", PlayerType.Nation, null, "foe");
    const game = await setup(
      "big_plains",
      {
        instantBuild: true,
        startingGold: 0,
        disablePaths: true,
        disableAugments: true,
      },
      [pInfo, foeInfo],
      undefined,
      EngineConfig,
      false,
    );
    game.addExecution(
      new SpawnExecution("rework-c", pInfo, game.ref(40, 40)),
      new SpawnExecution("rework-c", foeInfo, game.ref(75, 40)),
    );
    executeTicks(game, 165);

    const emp = game.player("emp");
    const foe = game.player("foe");
    // Expand aggressively to 1,600 tiles with 0 Farms, 0 Cities, 0 Public Services, huge war mobilization, and 0 Gold
    paintTerritory(game, emp, 20, 59, 20, 59);
    paintTerritory(game, foe, 60, 95, 15, 65);
    emp.addCivilianPopulation(110_000);
    emp.setFood(40); // Almost out of food reserves
    emp.setTroops(650_000);
    foe.setTroops(500_000);
    emp.removeGold(emp.gold());
    // Launch an expensive 220k-troop war campaign on an empty treasury!
    game.addExecution(new AttackExecution(220_000, emp, foe.id(), null));

    // Within the active campaign & neglect window, famine and fiscal deficit both strike
    executeTicks(game, 35);
    expect(emp.inFiscalDeficit()).toBe(true);
    expect(
      crisisAttackerLossPercent(emp.stability(), emp.inFiscalDeficit()),
    ).toBeGreaterThan(110);
    expect(
      crisisAttackSpeedPercent(emp.stability(), emp.inFiscalDeficit()),
    ).toBeLessThan(100);
    expect(
      crisisTroopRegenPercent(emp.stability(), emp.inFiscalDeficit()),
    ).toBeLessThan(85);

    // Continue 20 more seconds of neglect so stability & population feel sustained famine + overexpansion
    executeTicks(game, 200);

    const neglectedFood = computeFoodBreakdown(
      emp,
      emp.civilianPopulation(),
      emp.food(),
    );
    expect(neglectedFood.status).toBe("famine");
    expect(emp.stability()).toBeLessThan(60);
    // Territory did NOT magically vanish/collapse immediately
    expect(emp.numTilesOwned()).toBeGreaterThanOrEqual(1_400);

    // Recovery: end offensive campaign, right-size army, lower taxes, and invest in Farms, Public Services & Cities
    for (const atk of emp.outgoingAttacks()) {
      atk.delete();
    }
    const lowPointStability = emp.stability();
    emp.setTroops(85_000);
    emp.addGold(900_000n);
    game.addExecution(
      new SetTaxRateExecution(emp, TaxRate.Low),
      new ConstructionExecution(emp, UnitType.Farm, game.ref(25, 25)),
      new ConstructionExecution(emp, UnitType.Bakery, game.ref(45, 25)),
      new ConstructionExecution(emp, UnitType.PublicServices, game.ref(25, 45)),
      new ConstructionExecution(emp, UnitType.City, game.ref(45, 45)),
    );
    executeTicks(game, 10);
    pUpgradeAll(emp);

    executeTicks(game, 300); // 30 seconds of recovery
    const recoveredFood = computeFoodBreakdown(
      emp,
      emp.civilianPopulation(),
      emp.food(),
    );
    expect(recoveredFood.status).toBe("surplus");
    expect(emp.inFiscalDeficit()).toBe(false);
    expect(emp.stability()).toBeGreaterThan(lowPointStability + 12);
  });

  test("Scenario D: Military, Political, and Scientific Development Paths solve national challenges differently", async () => {
    const milInfo = new PlayerInfo("MilPower", PlayerType.Human, "c1", "mil");
    const polInfo = new PlayerInfo("PolEmpire", PlayerType.Human, "c2", "pol");
    const sciInfo = new PlayerInfo("SciTechnate", PlayerType.Human, "c3", "sci");

    const game = await setup(
      "big_plains",
      {
        instantBuild: true,
        startingGold: 3_000_000,
        disableAugments: true,
      },
      [milInfo, polInfo, sciInfo],
      undefined,
      undefined,
      false,
    );
    game.addExecution(
      new SpawnExecution("rework-d", milInfo, game.ref(15, 15)),
      new SpawnExecution("rework-d", polInfo, game.ref(50, 50)),
      new SpawnExecution("rework-d", sciInfo, game.ref(82, 82)),
    );
    executeTicks(game, 165);

    const mil = game.player("mil");
    const pol = game.player("pol");
    const sci = game.player("sci");

    for (const [p, cx, cy, path] of [
      [mil, 15, 15, DevelopmentPath.Military],
      [pol, 50, 50, DevelopmentPath.Political],
      [sci, 82, 82, DevelopmentPath.Scientific],
    ] as const) {
      paintTerritory(game, p, cx - 14, cx + 15, cy - 14, cy + 15); // 900 tiles each
      p.setPrimaryPath(path);
      p.addScience(5_000);
      p.unlockDevTier(path);
      p.unlockDevTier(path);
      p.unlockDevTier(path); // Tier 3 on primary path
      p.setTroops(180_000);
    }

    const milMods = mil.pathModifiers();
    const polMods = pol.pathModifiers();
    const sciMods = sci.pathModifiers();

    // Military Path: cheapest military upkeep & strongest combat efficiency, but lowest admin capacity
    const milUpkeep = computeMilitaryUpkeepPerSecond(mil, 50_000, 0, milMods);
    const polUpkeep = computeMilitaryUpkeepPerSecond(pol, 50_000, 0, polMods);
    expect(milUpkeep).toBeLessThan(polUpkeep);
    expect(milMods.attackerLossPercent).toBeLessThan(polMods.attackerLossPercent);

    // Political Path: highest administrative capacity & lowest expansion pressure on 900-tile empire
    const milAdmin = computeAdministrativeCapacity(mil, milMods);
    const polAdmin = computeAdministrativeCapacity(pol, polMods);
    expect(polAdmin).toBeGreaterThan(milAdmin * 1.8);

    const milStab = computeStabilityBreakdown(mil, TaxRate.Normal, 60_000, 0, milMods);
    const polStab = computeStabilityBreakdown(pol, TaxRate.Normal, 60_000, 0, polMods);
    expect(polStab.overexpansion).toBeGreaterThan(milStab.overexpansion);
    expect(polStab.target).toBeGreaterThan(milStab.target + 20);

    // Scientific Path: highest agritech food multiplier & science generation
    expect(sciMods.foodProductionPercent).toBeGreaterThan(milMods.foodProductionPercent);
    expect(sciMods.scienceRatePercent).toBeGreaterThan(polMods.scienceRatePercent);
  });

  test("Scenario E & Snapshot v9: AI Nations obey human national rules, build Farms/Public Services, adjust Taxes, and round-trip snapshots", async () => {
    const humanInfo = new PlayerInfo("SuperpowerA", PlayerType.Human, "c1", "hum");
    const aiInfo = new PlayerInfo("AISuperpower", PlayerType.Nation, null, "ai_nat");
    const aiNation = new Nation(new Cell(65, 65), aiInfo);

    const game = await setup(
      "big_plains",
      {
        difficulty: Difficulty.Hard,
        instantBuild: true,
        startingGold: 1_200_000,
        disableAugments: true,
      },
      [humanInfo],
      undefined,
      EngineConfig,
      false,
      [aiNation],
    );
    game.addExecution(
      new SpawnExecution("rework-e", humanInfo, game.ref(20, 20)),
      new SpawnExecution("rework-e", aiInfo, game.ref(65, 65)),
      new NationExecution("rework-e", aiNation),
    );
    executeTicks(game, 105);
    // Lock human primary path so Singleplayer opening Path Draft does not pause simulation
    game.player("hum").setPrimaryPath(DevelopmentPath.Military);
    game.endSpawnPhase();
    executeTicks(game, 15);

    const ai = game.player("ai_nat");
    paintTerritory(game, ai, 50, 80, 50, 80); // 961 tiles -> exceeds base 450 admin cap!
    ai.addCivilianPopulation(75_000); // High food consumption -> requires Farms!
    ai.setFood(400); // Shortage!
    ai.setStability(32); // Crisis -> AI must NOT be protected by old 50% floor, and should respond!
    ai.addScience(260); // Enough for T1 path unlock without jumping +20 stability immediately

    expect(ai.stability()).toBe(32); // AI stability floor (50) is gone!

    // Within 25 ticks (2.5s), AI Nation lowers taxes to Low in response to Crisis (32% stability)
    executeTicks(game, 25);
    expect(ai.taxRate()).toBe(TaxRate.Low);
    expect(ai.primaryPath()).not.toBeNull();

    // Over the next 100 ticks (10s), AI Nation builds sustainability structures & recovers!
    executeTicks(game, 100);
    const totalSustainabilityBuildings =
      ai.units(UnitType.Farm).length +
      ai.units(UnitType.PublicServices).length +
      ai.units(UnitType.Bakery).length;
    expect(totalSustainabilityBuildings).toBeGreaterThanOrEqual(1);

    // Verify PlayerSnapshot v9 round-trip preserves unintegratedTiles & inFiscalDeficit byte-identically
    await expectSnapshotRoundTrip(game, "big_plains", 20);
  });

  test("Scenario F: Disabled pre-game system toggles cleanly isolate disabled mechanics without phantom penalties", async () => {
    const pInfo = new PlayerInfo("ClassicToggle", PlayerType.Human, "c1", "p1");
    const game = await setup(
      "plains",
      {
        instantBuild: true,
        startingGold: 500_000,
        disableFood: true,
        disablePaths: true,
        disableTrade: true,
        disableBounties: true,
        disableRebellions: true,
        disableAugments: true,
      },
      [pInfo],
      undefined,
      EngineConfig,
      false,
    );
    game.addExecution(new SpawnExecution("rework-f", pInfo, game.ref(20, 20)));
    executeTicks(game, 120);

    const p1 = game.player("p1");
    p1.setFood(0);
    p1.addCivilianPopulation(15_000);
    p1.setStability(10); // Would normally build rebellion meter if rebellions were enabled

    const popBefore = p1.civilianPopulation();
    executeTicks(game, 60);

    // With disableFood: true, 0 food causes zero famine decline and population still grows normally
    expect(p1.civilianPopulation()).toBeGreaterThan(popBefore);
    expect(game.config().isUnitDisabled(UnitType.Farm)).toBe(true);
    expect(game.config().isUnitDisabled(UnitType.Bakery)).toBe(true);
    expect(game.config().isUnitDisabled(UnitType.Granary)).toBe(true);
    // With disableRebellions: true, rebellion meter stays 0
    expect(p1.rebellionMeter()).toBe(0);
    // With disableBounties: true, bounty never triggers
    expect(game.triggerBountyEvent()).toBe(false);
  });

  test("Match Pacing Benchmark: 8 competing nations transition naturally from Phase I Establishment into Phase II Regional Power Struggle without instant early snowball wipeout", async () => {
    const spawnCoords = [
      [15, 15],
      [48, 15],
      [82, 15],
      [15, 50],
      [82, 50],
      [15, 82],
      [48, 82],
      [82, 82],
    ] as const;
    const nations: Nation[] = spawnCoords.map(
      ([x, y], idx) =>
        new Nation(
          new Cell(x, y),
          new PlayerInfo(
            `Nation_${idx + 1}`,
            PlayerType.Nation,
            null,
            `nat_${idx + 1}`,
          ),
        ),
    );

    const game = await setup(
      "big_plains",
      {
        difficulty: Difficulty.Hard,
        disableAugments: true,
      },
      [],
      undefined,
      EngineConfig,
      false,
      nations,
    );

    for (const n of nations) {
      game.addExecution(new NationExecution("rework-pacing", n));
    }
    game.addExecution(new WinCheckExecution());

    // Run spawn phase (105 ticks), end spawn phase, then simulate 7 minutes of Phase I (4,200 ticks)
    executeTicks(game, 105);
    game.endSpawnPhase();
    executeTicks(game, 4_200);

    const aliveAt7m = game.players().filter((p) => p.isAlive() && p.type() === PlayerType.Nation);
    const totalFarmsAndCivicAt7m = aliveAt7m.reduce(
      (sum, p) =>
        sum +
        p.units(UnitType.Farm).length +
        p.units(UnitType.PublicServices).length +
        p.units(UnitType.Housing).length +
        p.units(UnitType.City).length,
      0,
    );
    const totalPathTiersAt7m = aliveAt7m.reduce(
      (sum, p) =>
        sum +
        p.devLevel(DevelopmentPath.Military) +
        p.devLevel(DevelopmentPath.Political) +
        p.devLevel(DevelopmentPath.Scientific),
      0,
    );

    // At 7 minutes (end of Phase I): match has NOT ended prematurely, multiple regional powers are established,
    // and nations have invested in civic/agricultural infrastructure and early Development Path tiers!
    expect(game.getWinner()).toBeNull();
    expect(aliveAt7m.length).toBeGreaterThanOrEqual(2);
    expect(totalFarmsAndCivicAt7m).toBeGreaterThan(0);
    expect(totalPathTiersAt7m).toBeGreaterThan(0);
  });

  test("Conquest Playability: a stable, funded player decisively conquers a neighboring real Nation and earns Victory Spoils without collapsing", async () => {
    const humanInfo = new PlayerInfo("PlayerRepublic", PlayerType.Human, "c1", "hero");
    const rivalInfo = new PlayerInfo("RivalKingdom", PlayerType.Nation, null, "rival_nat");

    const game = await setup(
      "big_plains",
      {
        difficulty: Difficulty.Hard,
        instantBuild: true,
        disablePaths: true,
        disableAugments: true,
      },
      [humanInfo, rivalInfo],
      undefined,
      EngineConfig,
      false,
    );

    game.addExecution(
      new SpawnExecution("rework-conq", humanInfo, game.ref(25, 25)),
      new SpawnExecution("rework-conq", rivalInfo, game.ref(45, 25)),
    );
    executeTicks(game, 105);
    game.endSpawnPhase();
    executeTicks(game, 15);

    const hero = game.player("hero");
    const rival = game.player("rival_nat");

    paintTerritory(game, hero, 15, 34, 15, 34); // 400-tile homeland
    paintTerritory(game, rival, 35, 50, 15, 34); // 320-tile neighboring nation
    hero.setTroops(95_000);
    rival.setTroops(45_000);
    rival.addCivilianPopulation(30_000);
    rival.setFood(2_000);

    const popBefore = hero.civilianPopulation();
    game.addExecution(new AttackExecution(75_000, hero, rival.id(), null));
    executeTicks(game, 120);

    // Rival nation is decisively conquered and annexed, and player remains Stable & out of Fiscal Deficit
    expect(rival.isAlive()).toBe(false);
    expect(hero.numTilesOwned()).toBeGreaterThan(680);
    expect(hero.inFiscalDeficit()).toBe(false);
    expect(hero.stability()).toBeGreaterThanOrEqual(60);
    expect(hero.civilianPopulation()).toBeGreaterThan(popBefore + 8_000);
  });
});

function pUpgradeAll(player: Player): void {
  for (const type of [
    UnitType.Farm,
    UnitType.PublicServices,
    UnitType.City,
  ] as const) {
    for (const u of player.units(type)) {
      player.upgradeUnit(u);
    }
  }
}
