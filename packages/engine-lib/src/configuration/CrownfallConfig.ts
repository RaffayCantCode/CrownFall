import {
  Gold,
  PlayerType,
  TaxRate,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { PlayerLike } from "@openfront/engine-api/game/ReadViews";
import { pow } from "../DetMath";
import {
  type CrownfallPathModifiers,
  NEUTRAL_PATH_MODIFIERS,
} from "./CrownfallPaths";

/**
 * Crownfall national management constants & deterministic rules.
 *
 * All calculations use integer math or DetMath so every client stays
 * bit-identical. Values are centralized here for easy balance tuning.
 */
export const CROWNFALL_CONFIG = {
  /** National management updates every 10 ticks (1 second). */
  updateIntervalTicks: 10,

  startingStability: 75,
  minStability: 0,
  maxStability: 100,
  /** Stability drifts toward its target by at most this much per second. */
  stabilityStepPerSecond: 1,
  /** AI players stay above this floor in Phase 1 so existing AI behavior is undisturbed. */
  aiStabilityFloor: 50,

  startingCivilianPop: 10_000,
  baseCivilianPopCap: 50_000,
  housingPopCapPerLevel: 150_000,
  /** Base civilian pop per owned tile (sublinear via pow(tiles, 0.65)). */
  tilePopCapScale: 450,
  tilePopCapExponent: 0.65,

  /** Baseline academic science per second for every alive nation. */
  baseSciencePerSec: 2,
  /** Base science generated per second per Research Centre level. */
  researchCentreSciencePerSec: 12,
  /** Passive industrial gold per second per Power Plant (UnitType.Housing) level. */
  powerPlantGoldPerSec: 2_500,
  /** Passive science per second from every 25k civilian population. */
  civilianScienceDivisor: 25_000,

  /** Stability target contributors. */
  baseStabilityTarget: 62,
  publicServicesStabilityPerLevel: 7,
  publicServicesStabilityMax: 35,
  housingSurplusBonus: 5,
  housingOvercrowdedPenalty: -8,
  activeWarStrainPerAttack: -6,
  activeWarStrainMax: -24,
  overexpansionFreeTiles: 6_000,
  overexpansionTilesPerPoint: 8_000,
  overexpansionStrainMax: -28,

  /** Tax rate modifiers (percentages as integers for deterministic math). */
  tax: {
    [TaxRate.Low]: {
      incomePercent: 60,
      stabilityDelta: 14,
      growthPercent: 130,
    },
    [TaxRate.Normal]: {
      incomePercent: 100,
      stabilityDelta: 0,
      growthPercent: 100,
    },
    [TaxRate.High]: {
      incomePercent: 165,
      stabilityDelta: -26,
      growthPercent: 70,
    },
  },

  /** Phase 7: Stable Hegemony Victory rules. */
  hegemony: {
    enabled: true,
    /** Seconds a leading nation/team must hold territory + stability >= minStability. */
    holdSeconds: 90,
    /** Minimum stability (0-100) required to advance Stable Hegemony. */
    minStability: 50,
    /** Seconds lost per second when stability drops below minStability or territory slips. */
    decayPerSecond: 2,
  },
} as const;

export type StabilityBand = "stable" | "unrest" | "crisis" | "rebellion";

export interface StabilityBreakdown {
  base: number;
  tax: number;
  publicServices: number;
  housing: number;
  warStrain: number;
  overexpansion: number;
  development: number;
  target: number;
}

export function stabilityBand(stability: number): StabilityBand {
  if (stability >= 60) return "stable";
  if (stability >= 35) return "unrest";
  if (stability >= 15) return "crisis";
  return "rebellion";
}

export function completedStructureLevels(
  player: PlayerLike,
  unitType: UnitType,
): number {
  let total = 0;
  for (const u of player.units(unitType)) {
    if (u.isActive() && !u.isUnderConstruction()) {
      total += u.level();
    }
  }
  return total;
}

export function maxCivilianPopulation(player: PlayerLike): number {
  const tiles = Math.max(0, player.numTilesOwned());
  const housingLevels = completedStructureLevels(player, UnitType.Housing);
  const tileCap = Math.floor(
    pow(tiles, CROWNFALL_CONFIG.tilePopCapExponent) *
      CROWNFALL_CONFIG.tilePopCapScale,
  );
  return (
    CROWNFALL_CONFIG.baseCivilianPopCap +
    tileCap +
    housingLevels * CROWNFALL_CONFIG.housingPopCapPerLevel
  );
}

export function computeStabilityBreakdown(
  player: PlayerLike,
  taxRate: TaxRate,
  civilianPop: number,
  activeIncomingAttacks: number,
  mods: CrownfallPathModifiers = NEUTRAL_PATH_MODIFIERS,
): StabilityBreakdown {
  const base = CROWNFALL_CONFIG.baseStabilityTarget;
  const tax = CROWNFALL_CONFIG.tax[taxRate].stabilityDelta;

  const publicServiceLevels = completedStructureLevels(
    player,
    UnitType.PublicServices,
  );
  const publicServices = Math.min(
    CROWNFALL_CONFIG.publicServicesStabilityMax,
    publicServiceLevels * CROWNFALL_CONFIG.publicServicesStabilityPerLevel,
  );

  const cap = Math.max(1, maxCivilianPopulation(player));
  const housingRatioPercent = Math.floor((civilianPop * 100) / cap);
  let housing = 0;
  if (
    housingRatioPercent <= 80 &&
    completedStructureLevels(player, UnitType.Housing) > 0
  ) {
    housing = CROWNFALL_CONFIG.housingSurplusBonus;
  } else if (housingRatioPercent >= 95) {
    housing = CROWNFALL_CONFIG.housingOvercrowdedPenalty;
  }

  const warStrain = Math.max(
    CROWNFALL_CONFIG.activeWarStrainMax,
    activeIncomingAttacks * CROWNFALL_CONFIG.activeWarStrainPerAttack,
  );

  const excessTiles = Math.max(
    0,
    player.numTilesOwned() - CROWNFALL_CONFIG.overexpansionFreeTiles,
  );
  const rawOverexpansion = Math.min(
    -CROWNFALL_CONFIG.overexpansionStrainMax,
    Math.floor(excessTiles / CROWNFALL_CONFIG.overexpansionTilesPerPoint),
  );
  const overexpansion = -Math.floor(
    (rawOverexpansion * mods.overexpansionStrainPercent) / 100,
  );
  const development = mods.stabilityTargetDelta;

  const rawTarget =
    base +
    tax +
    publicServices +
    housing +
    warStrain +
    overexpansion +
    development;
  const minFloor =
    player.type() === PlayerType.Human
      ? CROWNFALL_CONFIG.minStability
      : CROWNFALL_CONFIG.aiStabilityFloor;
  const target = Math.max(
    minFloor,
    Math.min(CROWNFALL_CONFIG.maxStability, rawTarget),
  );

  return {
    base,
    tax,
    publicServices,
    housing,
    warStrain,
    overexpansion,
    development,
    target,
  };
}

export function civilianGrowthPerSecond(
  player: PlayerLike,
  currentPop: number,
  stability: number,
  taxRate: TaxRate,
  mods: CrownfallPathModifiers = NEUTRAL_PATH_MODIFIERS,
): number {
  const cap = maxCivilianPopulation(player);
  if (currentPop >= cap) {
    // Gentle contraction if cap dropped below current pop (e.g. lost Housing/land)
    return -Math.max(1, Math.floor((currentPop - cap) / 20));
  }
  const headroom = cap - currentPop;
  const baseGrowth = Math.max(50, Math.floor(headroom / 90));
  const taxMult = CROWNFALL_CONFIG.tax[taxRate].growthPercent;
  // Stability scales growth: 100 stability = 120%, 50 = 100%, 0 = 60%
  const stabMult = 60 + Math.floor((stability * 60) / 100);
  const delta = Math.floor(
    (baseGrowth * taxMult * stabMult * mods.civilianGrowthPercent) / 1_000_000,
  );
  return Math.min(headroom, Math.max(0, delta));
}

export function civilianTaxGoldPerSecond(
  player: PlayerLike,
  civilianPop: number,
  stability: number,
  taxRate: TaxRate,
  goldMultiplier: number = 1,
  mods: CrownfallPathModifiers = NEUTRAL_PATH_MODIFIERS,
): Gold {
  if (player.type() === PlayerType.Bot) {
    return 0n;
  }
  // 15 gold/sec per 1,000 civilians at Normal tax & 100% stability efficiency.
  const baseGold = Math.floor((civilianPop * 15) / 1000);
  const taxMult = CROWNFALL_CONFIG.tax[taxRate].incomePercent;
  // Low stability hurts tax collection sharply (100% at >=60, 75% in unrest, 50% in crisis, 25% in rebellion).
  const stabEfficiency =
    stability >= 60
      ? 100
      : stability >= 35
        ? 75
        : stability >= 15
          ? 50
          : 25;
  const raw = Math.floor(
    ((baseGold * taxMult * stabEfficiency * mods.civilianTaxPercent) /
      1_000_000) *
      goldMultiplier,
  );
  const powerLevels = completedStructureLevels(player, UnitType.Housing);
  const powerGold = Math.floor(
    powerLevels * CROWNFALL_CONFIG.powerPlantGoldPerSec * goldMultiplier,
  );
  return BigInt(Math.max(0, raw + powerGold));
}

export function sciencePerSecond(
  player: PlayerLike,
  civilianPop: number,
  stability: number,
  mods: CrownfallPathModifiers = NEUTRAL_PATH_MODIFIERS,
): number {
  const researchLevels = completedStructureLevels(
    player,
    UnitType.ResearchCentre,
  );
  const fromCentres =
    researchLevels * CROWNFALL_CONFIG.researchCentreSciencePerSec;
  const fromPop = Math.floor(
    civilianPop / CROWNFALL_CONFIG.civilianScienceDivisor,
  );
  const raw = CROWNFALL_CONFIG.baseSciencePerSec + fromCentres + fromPop;
  if (raw <= 0) return 0;
  // Unrest slows research slightly (70% at 0 stability, 100% at >= 60)
  const stabEfficiency =
    stability >= 60 ? 100 : 70 + Math.floor((stability * 30) / 60);
  return Math.max(
    1,
    Math.floor((raw * stabEfficiency * mods.scienceRatePercent) / 10_000),
  );
}

/**
 * Minimum completed Research Centre levels required to construct advanced
 * Science-dependent structures and strategic systems.
 */
export function requiredResearchLevels(unitType: UnitType): number {
  switch (unitType) {
    case UnitType.SpyNetwork:
      return 3;
    case UnitType.OrbitalRadar:
      return 5;
    case UnitType.CyberCommand:
      return 10;
    default:
      return 0;
  }
}

/**
 * Applies passive strategic bonuses from completed Power Plants (UnitType.Housing),
 * Orbital Radars, and Cyber Commands onto a player's modifiers.
 */
export function applyScienceBuildingModifiers(
  player: PlayerLike,
  mods: CrownfallPathModifiers,
): CrownfallPathModifiers {
  const powerLevels = completedStructureLevels(player, UnitType.Housing);
  const radarLevels = completedStructureLevels(player, UnitType.OrbitalRadar);
  const cyberLevels = completedStructureLevels(player, UnitType.CyberCommand);
  if (powerLevels === 0 && radarLevels === 0 && cyberLevels === 0) {
    return mods;
  }
  const powerRegenBonus = Math.min(50, powerLevels * 10);
  const powerCostCut = Math.min(25, powerLevels * 5);
  const powerSciBonus = Math.min(40, powerLevels * 8);
  const samRangeBonus = Math.min(60, radarLevels * 15);
  const incomingNukeSlow = Math.min(35, radarLevels * 10);
  const siloCooldownCut = Math.min(35, cyberLevels * 10);
  const scienceBonus = Math.min(60, cyberLevels * 15) + powerSciBonus;
  const attackerLossCut = Math.min(20, cyberLevels * 5);
  return {
    ...mods,
    troopRegenPercent: mods.troopRegenPercent + powerRegenBonus,
    structureCostPercent: Math.max(
      45,
      mods.structureCostPercent - powerCostCut,
    ),
    samRangePercent: mods.samRangePercent + samRangeBonus,
    incomingNukeSlowPercent: Math.max(
      35,
      mods.incomingNukeSlowPercent - incomingNukeSlow,
    ),
    siloCooldownPercent: Math.max(
      35,
      mods.siloCooldownPercent - siloCooldownCut,
    ),
    scienceRatePercent: mods.scienceRatePercent + scienceBonus,
    attackerLossPercent: Math.max(
      40,
      mods.attackerLossPercent - attackerLossCut,
    ),
  };
}
