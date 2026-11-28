import { UnitType } from "@openfront/engine-api/game/GameTypes";
import { PlayerLike } from "@openfront/engine-api/game/ReadViews";
import { pow } from "../DetMath";
import { completedStructureLevels } from "./CrownfallConfig";

export type FoodStatus = "surplus" | "balanced" | "shortage" | "famine";

export interface FoodBreakdown {
  reserves: number;
  maxStorage: number;
  productionPerSec: number;
  consumptionPerSec: number;
  tradeNetPerSec: number;
  netPerSec: number;
  productionPerMin: number;
  consumptionPerMin: number;
  tradeNetPerMin: number;
  netPerMin: number;
  status: FoodStatus;
}

export const CROWNFALL_FOOD_CONFIG = {
  startingFood: 1_500,
  baseFoodCap: 6_000,
  granaryCapPerLevel: 8_000,
  baseHomelandFoodPerSec: 5, // 300 / min baseline supports early homeland (~15k-18k pop), then requires Farms/Trade
  arableLandExponent: 0.5,
  arableLandDivisor: 6, // Unimproved conquered land gives modest foraging, never replacing Farms
  farmFoodPerSecPerLevel: 18, // +1,080 / min per Farm level
  bakeryFlatFoodPerSecPerLevel: 6, // +360 / min per Bakery level
  bakeryEfficiencyPercentPerLevel: 15, // +15% food efficiency per Bakery level
  bakeryEfficiencyMaxPercent: 75,
  bakeryPopCapPerLevel: 80_000,
  bakeryStabilityPerLevel: 3,
  bakeryStabilityMax: 15,
  civiliansPerFoodPerSec: 3_000, // 20 food/min per 1,000 civilians
  shortageWarningThresholdPercent: 20,
  acuteShortageStabilityPenalty: -8,
  famineStabilityPenalty: -20,
  abundantSurplusStabilityBonus: 4,
  faminePopDeclineDivisor: 90,
  famineMinPopDeclinePerSec: 100,
} as const;

export function maxFoodStorage(granaryLevels: number = 0): number {
  return (
    CROWNFALL_FOOD_CONFIG.baseFoodCap +
    Math.max(0, granaryLevels) * CROWNFALL_FOOD_CONFIG.granaryCapPerLevel
  );
}

export function foodProductionPerSecond(
  player: PlayerLike,
  farmLevels: number = 0,
  bakeryLevels: number = 0,
  foodProductionPercent: number = 100,
): number {
  const tiles = Math.max(0, player.numTilesOwned());
  const arable = Math.floor(
    pow(tiles, CROWNFALL_FOOD_CONFIG.arableLandExponent) /
      CROWNFALL_FOOD_CONFIG.arableLandDivisor,
  );
  const raw =
    CROWNFALL_FOOD_CONFIG.baseHomelandFoodPerSec +
    arable +
    Math.max(0, farmLevels) * CROWNFALL_FOOD_CONFIG.farmFoodPerSecPerLevel +
    Math.max(0, bakeryLevels) *
      CROWNFALL_FOOD_CONFIG.bakeryFlatFoodPerSecPerLevel;
  const effBonus = Math.min(
    CROWNFALL_FOOD_CONFIG.bakeryEfficiencyMaxPercent,
    Math.max(0, bakeryLevels) *
      CROWNFALL_FOOD_CONFIG.bakeryEfficiencyPercentPerLevel,
  );
  return Math.max(
    0,
    Math.floor((raw * (100 + effBonus) * foodProductionPercent) / 10_000),
  );
}

export function foodConsumptionPerSecond(civilianPop: number): number {
  if (civilianPop <= 0) return 0;
  return Math.max(
    1,
    Math.floor(civilianPop / CROWNFALL_FOOD_CONFIG.civiliansPerFoodPerSec),
  );
}

export function foodStatusFor(
  food: number,
  maxStorage: number,
  netPerSec: number,
): FoodStatus {
  if (food <= 0 && netPerSec < 0) {
    return "famine";
  }
  const reservePct =
    maxStorage > 0 ? Math.floor((food * 100) / maxStorage) : 0;
  if (netPerSec > 0 || (netPerSec === 0 && reservePct >= 35)) {
    return "surplus";
  }
  if (netPerSec === 0) {
    return "balanced";
  }
  // netPerSec < 0 while food > 0: if reserves are still high (>= 50%), treat as buffered balanced/surplus; below 50% is shortage
  if (reservePct >= 50) {
    return "balanced";
  }
  return "shortage";
}

export function computeFoodBreakdown(
  player: PlayerLike,
  civilianPop: number,
  currentFood: number,
  farmLevels: number = completedStructureLevels(player, UnitType.Farm),
  bakeryLevels: number = completedStructureLevels(player, UnitType.Bakery),
  granaryLevels: number = completedStructureLevels(player, UnitType.Granary),
  tradeNetPerSec: number = 0,
  foodProductionPercent: number = 100,
): FoodBreakdown {
  const maxStorage = maxFoodStorage(granaryLevels);
  const productionPerSec = foodProductionPerSecond(
    player,
    farmLevels,
    bakeryLevels,
    foodProductionPercent,
  );
  const consumptionPerSec = foodConsumptionPerSecond(civilianPop);
  const netPerSec = productionPerSec + tradeNetPerSec - consumptionPerSec;
  const reserves = Math.max(0, Math.min(maxStorage, currentFood));
  const status = foodStatusFor(reserves, maxStorage, netPerSec);
  return {
    reserves,
    maxStorage,
    productionPerSec,
    consumptionPerSec,
    tradeNetPerSec,
    netPerSec,
    productionPerMin: productionPerSec * 60,
    consumptionPerMin: consumptionPerSec * 60,
    tradeNetPerMin: tradeNetPerSec * 60,
    netPerMin: netPerSec * 60,
    status,
  };
}

export function applyFoodToPopulationGrowth(
  baseGrowth: number,
  currentPop: number,
  breakdown: FoodBreakdown,
): number {
  // If already contracting due to over-capacity, preserve contraction (or worsen under famine)
  if (breakdown.status === "famine") {
    const decline = Math.max(
      CROWNFALL_FOOD_CONFIG.famineMinPopDeclinePerSec,
      Math.floor(currentPop / CROWNFALL_FOOD_CONFIG.faminePopDeclineDivisor),
    );
    return -Math.min(currentPop, decline);
  }
  if (baseGrowth <= 0) {
    return baseGrowth;
  }
  if (breakdown.status === "surplus") {
    const abundant =
      breakdown.maxStorage > 0 &&
      breakdown.reserves * 100 >= breakdown.maxStorage * 75;
    return abundant ? Math.floor((baseGrowth * 115) / 100) : baseGrowth;
  }
  if (breakdown.status === "balanced") {
    return 0;
  }
  // Shortage: growth slows down at >=15% reserves, stops below 15%
  const reservePct =
    breakdown.maxStorage > 0
      ? Math.floor((breakdown.reserves * 100) / breakdown.maxStorage)
      : 0;
  if (reservePct >= 15) {
    return Math.floor((baseGrowth * 35) / 100);
  }
  return 0;
}

export function computeFoodStabilityDelta(
  breakdown: FoodBreakdown,
  bakeryLevels: number = 0,
): number {
  const bakeryBonus = Math.min(
    CROWNFALL_FOOD_CONFIG.bakeryStabilityMax,
    Math.max(0, bakeryLevels) * CROWNFALL_FOOD_CONFIG.bakeryStabilityPerLevel,
  );
  if (breakdown.status === "famine") {
    return CROWNFALL_FOOD_CONFIG.famineStabilityPenalty + bakeryBonus;
  }
  if (breakdown.status === "shortage") {
    const reservePct =
      breakdown.maxStorage > 0
        ? Math.floor((breakdown.reserves * 100) / breakdown.maxStorage)
        : 0;
    if (reservePct < CROWNFALL_FOOD_CONFIG.shortageWarningThresholdPercent) {
      return CROWNFALL_FOOD_CONFIG.acuteShortageStabilityPenalty + bakeryBonus;
    }
  }
  if (
    breakdown.status === "surplus" &&
    breakdown.maxStorage > 0 &&
    breakdown.reserves * 100 >= breakdown.maxStorage * 60
  ) {
    return CROWNFALL_FOOD_CONFIG.abundantSurplusStabilityBonus + bakeryBonus;
  }
  return bakeryBonus;
}
