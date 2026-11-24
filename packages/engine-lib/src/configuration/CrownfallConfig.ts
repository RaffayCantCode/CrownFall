import {
  Gold,
  PlayerType,
  TaxRate,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { PlayerLike } from "@openfront/engine-api/game/ReadViews";
import { pow } from "../DetMath";

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

  /** Base science generated per second per Research Centre level. */
  researchCentreSciencePerSec: 12,
  /** Passive science per second from every 100k civilian population. */
  civilianSciencePer100k: 1,

  /** Stability target contributors. */
  baseStabilityTarget: 70,
  publicServicesStabilityPerLevel: 6,
  publicServicesStabilityMax: 30,
  housingSurplusBonus: 5,
  housingOvercrowdedPenalty: -5,
  activeWarStrainPerAttack: -4,
  activeWarStrainMax: -16,
  overexpansionFreeTiles: 10_000,
  overexpansionTilesPerPoint: 15_000,
  overexpansionStrainMax: -20,

  /** Tax rate modifiers (percentages as integers for deterministic math). */
  tax: {
    [TaxRate.Low]: {
      incomePercent: 75,
      stabilityDelta: 10,
      growthPercent: 115,
    },
    [TaxRate.Normal]: {
      incomePercent: 100,
      stabilityDelta: 0,
      growthPercent: 100,
    },
    [TaxRate.High]: {
      incomePercent: 130,
      stabilityDelta: -15,
      growthPercent: 85,
    },
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
  if (housingRatioPercent <= 80 && completedStructureLevels(player, UnitType.Housing) > 0) {
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
  const overexpansion = -Math.min(
    -CROWNFALL_CONFIG.overexpansionStrainMax,
    Math.floor(excessTiles / CROWNFALL_CONFIG.overexpansionTilesPerPoint),
  );

  const rawTarget =
    base + tax + publicServices + housing + warStrain + overexpansion;
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
    target,
  };
}

export function civilianGrowthPerSecond(
  player: PlayerLike,
  currentPop: number,
  stability: number,
  taxRate: TaxRate,
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
  const delta = Math.floor((baseGrowth * taxMult * stabMult) / 10_000);
  return Math.min(headroom, Math.max(0, delta));
}

export function civilianTaxGoldPerSecond(
  player: PlayerLike,
  civilianPop: number,
  stability: number,
  taxRate: TaxRate,
  goldMultiplier: number = 1,
): Gold {
  if (player.type() === PlayerType.Bot) {
    return 0n;
  }
  // 15 gold/sec per 1,000 civilians at Normal tax & 100% stability efficiency.
  const baseGold = Math.floor((civilianPop * 15) / 1000);
  const taxMult = CROWNFALL_CONFIG.tax[taxRate].incomePercent;
  // Low stability hurts tax collection (50% efficiency at 0 stability, 100% at >= 60).
  const stabEfficiency =
    stability >= 60 ? 100 : 50 + Math.floor((stability * 50) / 60);
  const raw = Math.floor(
    ((baseGold * taxMult * stabEfficiency) / 10_000) * goldMultiplier,
  );
  return BigInt(Math.max(0, raw));
}

export function sciencePerSecond(
  player: PlayerLike,
  civilianPop: number,
  stability: number,
): number {
  const researchLevels = completedStructureLevels(
    player,
    UnitType.ResearchCentre,
  );
  const fromCentres =
    researchLevels * CROWNFALL_CONFIG.researchCentreSciencePerSec;
  const fromPop = Math.floor(
    (civilianPop * CROWNFALL_CONFIG.civilianSciencePer100k) / 100_000,
  );
  const raw = fromCentres + fromPop;
  if (raw <= 0) return 0;
  // Unrest slows research slightly (70% at 0 stability, 100% at >= 60)
  const stabEfficiency =
    stability >= 60 ? 100 : 70 + Math.floor((stability * 30) / 60);
  return Math.max(0, Math.floor((raw * stabEfficiency) / 100));
}
