import { DevelopmentPath, Gold } from "@openfront/engine-api/game/GameTypes";

export const PRIMARY_PATH_MAX_TIER = 4;
export const SECONDARY_PATH_MAX_TIER = 2;
/** Primary path gets a 20% Science & Gold cost discount (integer percent = 80). */
export const PRIMARY_PATH_COST_PERCENT = 80;

export interface PathProgress {
  primaryPath: DevelopmentPath | null;
  militaryLevel: number;
  politicalLevel: number;
  scientificLevel: number;
}

export interface DevTierDefinition {
  tier: number;
  baseScienceCost: number;
  baseGoldCost: Gold;
  primaryOnly: boolean;
  immediateReservePercent: number;
  immediateMaxTroops: number;
  immediateStabilityBonus: number;
  immediateCivilianBonus: number;
  nameKey: string;
  proKey: string;
  conKey: string;
}

export interface CrownfallPathModifiers {
  /** Multiplier (%) on troop replenishment rate (100 = 1.0x). */
  troopRegenPercent: number;
  /** Multiplier (%) on maximum army troop capacity (100 = 1.0x). */
  maxTroopsPercent: number;
  /** Multiplier (%) on attacker troop losses (100 = 1.0x; lower is better for attacker). */
  attackerLossPercent: number;
  /** Multiplier (%) on attack push speed (100 = 1.0x; higher is faster). */
  attackSpeedPercent: number;
  /** Multiplier (%) on enemy attack speed when defending (100 = 1.0x; lower slows invaders). */
  defenderSlowPercent: number;
  /** Flat bonus/penalty to National Stability target. */
  stabilityTargetDelta: number;
  /** Multiplier (%) on overexpansion stability penalty (100 = 1.0x; lower = easier large empires). */
  overexpansionStrainPercent: number;
  /** Multiplier (%) on civilian tax gold income (100 = 1.0x). */
  civilianTaxPercent: number;
  /** Multiplier (%) on train & trade ship gold income (100 = 1.0x). */
  tradeIncomePercent: number;
  /** Multiplier (%) on structure & arsenal Gold build/upgrade cost (100 = 1.0x; lower = cheaper). */
  structureCostPercent: number;
  /** Multiplier (%) on civilian population growth (100 = 1.0x). */
  civilianGrowthPercent: number;
  /** Multiplier (%) on Science generation (100 = 1.0x). */
  scienceRatePercent: number;
  /** Multiplier (%) on SAM Launcher range (100 = 1.0x). */
  samRangePercent: number;
  /** Multiplier (%) on SAM Launcher reload cooldown (100 = 1.0x; lower = faster reload). */
  samCooldownPercent: number;
  /** Multiplier (%) on Missile Silo reload cooldown (100 = 1.0x; lower = faster reload). */
  siloCooldownPercent: number;
  /** Multiplier (%) on outgoing missile/nuke flight speed (100 = 1.0x; higher = faster). */
  nukeSpeedPercent: number;
  /** Multiplier (%) on incoming missile/nuke flight speed (100 = 1.0x; lower slows enemy missiles via EW). */
  incomingNukeSlowPercent: number;
  /** Multiplier (%) on outgoing nuke blast radius (100 = 1.0x; higher = precision warhead yield). */
  nukeBlastRadiusPercent: number;
}

export const NEUTRAL_PATH_MODIFIERS: CrownfallPathModifiers = {
  troopRegenPercent: 100,
  maxTroopsPercent: 100,
  attackerLossPercent: 100,
  attackSpeedPercent: 100,
  defenderSlowPercent: 100,
  stabilityTargetDelta: 0,
  overexpansionStrainPercent: 100,
  civilianTaxPercent: 100,
  tradeIncomePercent: 100,
  structureCostPercent: 100,
  civilianGrowthPercent: 100,
  scienceRatePercent: 100,
  samRangePercent: 100,
  samCooldownPercent: 100,
  siloCooldownPercent: 100,
  nukeSpeedPercent: 100,
  incomingNukeSlowPercent: 100,
  nukeBlastRadiusPercent: 100,
};

export const DEV_PATH_TIERS: Record<
  DevelopmentPath,
  readonly DevTierDefinition[]
> = {
  [DevelopmentPath.Military]: [
    {
      tier: 1,
      baseScienceCost: 250,
      baseGoldCost: 100_000n,
      primaryOnly: false,
      immediateReservePercent: 10,
      immediateMaxTroops: 50_000,
      immediateStabilityBonus: 0,
      immediateCivilianBonus: 0,
      nameKey: "crownfall.path.military.t1.name",
      proKey: "crownfall.path.military.t1.pro",
      conKey: "crownfall.path.military.t1.con",
    },
    {
      tier: 2,
      baseScienceCost: 750,
      baseGoldCost: 300_000n,
      primaryOnly: false,
      immediateReservePercent: 12,
      immediateMaxTroops: 100_000,
      immediateStabilityBonus: 0,
      immediateCivilianBonus: 0,
      nameKey: "crownfall.path.military.t2.name",
      proKey: "crownfall.path.military.t2.pro",
      conKey: "crownfall.path.military.t2.con",
    },
    {
      tier: 3,
      baseScienceCost: 2000,
      baseGoldCost: 850_000n,
      primaryOnly: true,
      immediateReservePercent: 15,
      immediateMaxTroops: 180_000,
      immediateStabilityBonus: 0,
      immediateCivilianBonus: 0,
      nameKey: "crownfall.path.military.t3.name",
      proKey: "crownfall.path.military.t3.pro",
      conKey: "crownfall.path.military.t3.con",
    },
    {
      tier: 4,
      baseScienceCost: 4500,
      baseGoldCost: 2_200_000n,
      primaryOnly: true,
      immediateReservePercent: 20,
      immediateMaxTroops: 300_000,
      immediateStabilityBonus: 0,
      immediateCivilianBonus: 0,
      nameKey: "crownfall.path.military.t4.name",
      proKey: "crownfall.path.military.t4.pro",
      conKey: "crownfall.path.military.t4.con",
    },
  ],
  [DevelopmentPath.Political]: [
    {
      tier: 1,
      baseScienceCost: 250,
      baseGoldCost: 100_000n,
      primaryOnly: false,
      immediateReservePercent: 0,
      immediateMaxTroops: 0,
      immediateStabilityBonus: 10,
      immediateCivilianBonus: 15_000,
      nameKey: "crownfall.path.political.t1.name",
      proKey: "crownfall.path.political.t1.pro",
      conKey: "crownfall.path.political.t1.con",
    },
    {
      tier: 2,
      baseScienceCost: 750,
      baseGoldCost: 300_000n,
      primaryOnly: false,
      immediateReservePercent: 0,
      immediateMaxTroops: 0,
      immediateStabilityBonus: 10,
      immediateCivilianBonus: 30_000,
      nameKey: "crownfall.path.political.t2.name",
      proKey: "crownfall.path.political.t2.pro",
      conKey: "crownfall.path.political.t2.con",
    },
    {
      tier: 3,
      baseScienceCost: 2000,
      baseGoldCost: 850_000n,
      primaryOnly: true,
      immediateReservePercent: 10,
      immediateMaxTroops: 120_000,
      immediateStabilityBonus: 12,
      immediateCivilianBonus: 50_000,
      nameKey: "crownfall.path.political.t3.name",
      proKey: "crownfall.path.political.t3.pro",
      conKey: "crownfall.path.political.t3.con",
    },
    {
      tier: 4,
      baseScienceCost: 4500,
      baseGoldCost: 2_200_000n,
      primaryOnly: true,
      immediateReservePercent: 12,
      immediateMaxTroops: 180_000,
      immediateStabilityBonus: 15,
      immediateCivilianBonus: 80_000,
      nameKey: "crownfall.path.political.t4.name",
      proKey: "crownfall.path.political.t4.pro",
      conKey: "crownfall.path.political.t4.con",
    },
  ],
  [DevelopmentPath.Scientific]: [
    {
      tier: 1,
      baseScienceCost: 250,
      baseGoldCost: 100_000n,
      primaryOnly: false,
      immediateReservePercent: 0,
      immediateMaxTroops: 0,
      immediateStabilityBonus: 6,
      immediateCivilianBonus: 8_000,
      nameKey: "crownfall.path.scientific.t1.name",
      proKey: "crownfall.path.scientific.t1.pro",
      conKey: "crownfall.path.scientific.t1.con",
    },
    {
      tier: 2,
      baseScienceCost: 750,
      baseGoldCost: 300_000n,
      primaryOnly: false,
      immediateReservePercent: 0,
      immediateMaxTroops: 0,
      immediateStabilityBonus: 6,
      immediateCivilianBonus: 15_000,
      nameKey: "crownfall.path.scientific.t2.name",
      proKey: "crownfall.path.scientific.t2.pro",
      conKey: "crownfall.path.scientific.t2.con",
    },
    {
      tier: 3,
      baseScienceCost: 2000,
      baseGoldCost: 850_000n,
      primaryOnly: true,
      immediateReservePercent: 10,
      immediateMaxTroops: 110_000,
      immediateStabilityBonus: 0,
      immediateCivilianBonus: 25_000,
      nameKey: "crownfall.path.scientific.t3.name",
      proKey: "crownfall.path.scientific.t3.pro",
      conKey: "crownfall.path.scientific.t3.con",
    },
    {
      tier: 4,
      baseScienceCost: 4500,
      baseGoldCost: 2_200_000n,
      primaryOnly: true,
      immediateReservePercent: 12,
      immediateMaxTroops: 180_000,
      immediateStabilityBonus: 0,
      immediateCivilianBonus: 40_000,
      nameKey: "crownfall.path.scientific.t4.name",
      proKey: "crownfall.path.scientific.t4.pro",
      conKey: "crownfall.path.scientific.t4.con",
    },
  ],
};

export function pathLevelFor(
  progress: PathProgress,
  path: DevelopmentPath,
): number {
  switch (path) {
    case DevelopmentPath.Military:
      return progress.militaryLevel;
    case DevelopmentPath.Political:
      return progress.politicalLevel;
    case DevelopmentPath.Scientific:
      return progress.scientificLevel;
  }
}

export function maxTierForPath(
  primaryPath: DevelopmentPath | null,
  path: DevelopmentPath,
): number {
  return primaryPath === path
    ? PRIMARY_PATH_MAX_TIER
    : SECONDARY_PATH_MAX_TIER;
}

export function nextTierScienceCost(
  progress: PathProgress,
  path: DevelopmentPath,
): number | null {
  const current = pathLevelFor(progress, path);
  const maxTier = maxTierForPath(progress.primaryPath, path);
  if (current >= maxTier) {
    return null;
  }
  const def = DEV_PATH_TIERS[path][current];
  if (!def) return null;
  if (progress.primaryPath === path) {
    return Math.floor((def.baseScienceCost * PRIMARY_PATH_COST_PERCENT) / 100);
  }
  return def.baseScienceCost;
}

export function nextTierGoldCost(
  progress: PathProgress,
  path: DevelopmentPath,
): Gold | null {
  const current = pathLevelFor(progress, path);
  const maxTier = maxTierForPath(progress.primaryPath, path);
  if (current >= maxTier) {
    return null;
  }
  const def = DEV_PATH_TIERS[path][current];
  if (!def) return null;
  if (progress.primaryPath === path) {
    return (def.baseGoldCost * BigInt(PRIMARY_PATH_COST_PERCENT)) / 100n;
  }
  return def.baseGoldCost;
}

/**
 * Pure, integer-only calculation of cumulative modifiers from all unlocked
 * development tiers across the three paths.
 */
export function computeCrownfallPathModifiers(
  progress: PathProgress,
): CrownfallPathModifiers {
  let troopRegenPercent = 100;
  let maxTroopsPercent = 100;
  let attackerLossPercent = 100;
  let attackSpeedPercent = 100;
  let defenderSlowPercent = 100;
  let stabilityTargetDelta = 0;
  let overexpansionStrainPercent = 100;
  let civilianTaxPercent = 100;
  let tradeIncomePercent = 100;
  let structureCostPercent = 100;
  let civilianGrowthPercent = 100;
  let scienceRatePercent = 100;
  let samRangePercent = 100;
  let samCooldownPercent = 100;
  let siloCooldownPercent = 100;
  let nukeSpeedPercent = 100;
  let incomingNukeSlowPercent = 100;
  let nukeBlastRadiusPercent = 100;

  // --- Military Path: Blitzkrieg, Army Capacity & Arsenal Discounts ---
  const mil = progress.militaryLevel;
  if (mil >= 1) {
    troopRegenPercent += 22;
    maxTroopsPercent += 15;
    attackSpeedPercent += 12;
    stabilityTargetDelta -= 6;
    scienceRatePercent -= 8;
  }
  if (mil >= 2) {
    troopRegenPercent += 13; // total +35%
    maxTroopsPercent += 15; // total +30%
    attackerLossPercent -= 18;
    attackSpeedPercent += 12; // total +24%
    structureCostPercent -= 12;
    stabilityTargetDelta -= 4; // total -10
    civilianTaxPercent -= 8;
    overexpansionStrainPercent += 15;
  }
  if (mil >= 3) {
    maxTroopsPercent += 15; // total +45%
    attackerLossPercent -= 12; // total -30%
    siloCooldownPercent -= 20;
    nukeSpeedPercent += 22;
    structureCostPercent -= 8; // total -20%
    stabilityTargetDelta -= 5; // total -15
    scienceRatePercent -= 6; // total -14%
    civilianTaxPercent -= 6; // total -14%
  }
  if (mil >= 4) {
    troopRegenPercent += 20; // total +55%
    maxTroopsPercent += 20; // total +65%
    attackerLossPercent -= 12; // total -42%
    attackSpeedPercent += 16; // total +40%
    siloCooldownPercent -= 15; // total -35%
    nukeSpeedPercent += 15; // total +37%
    structureCostPercent -= 5; // total -25%
    stabilityTargetDelta -= 5; // total -20
    overexpansionStrainPercent += 15; // total +30%
    civilianTaxPercent -= 4; // total -18%
    scienceRatePercent -= 6; // total -20%
  }

  // --- Political Path: Imperial Treasury, Trade Wealth, Civic Discounts & Hegemony ---
  const pol = progress.politicalLevel;
  if (pol >= 1) {
    stabilityTargetDelta += 14;
    overexpansionStrainPercent -= 30;
    civilianTaxPercent += 30;
    tradeIncomePercent += 25;
    attackSpeedPercent -= 5;
  }
  if (pol >= 2) {
    civilianTaxPercent += 30; // total +60%
    tradeIncomePercent += 25; // total +50%
    civilianGrowthPercent += 30;
    defenderSlowPercent -= 20;
    structureCostPercent -= 15;
    attackSpeedPercent -= 3; // total -8%
    attackerLossPercent += 5;
  }
  if (pol >= 3) {
    stabilityTargetDelta += 10; // total +24
    overexpansionStrainPercent -= 25; // total -55%
    defenderSlowPercent -= 15; // total -35%
    maxTroopsPercent += 20;
    troopRegenPercent += 20;
    structureCostPercent -= 8; // total -23%
    attackerLossPercent += 2; // total +7%
    scienceRatePercent -= 8;
  }
  if (pol >= 4) {
    stabilityTargetDelta += 12; // total +36
    overexpansionStrainPercent -= 25; // total -80%
    civilianTaxPercent += 40; // total +100%
    tradeIncomePercent += 35; // total +85%
    civilianGrowthPercent += 25; // total +55%
    defenderSlowPercent -= 10; // total -45%
    maxTroopsPercent += 15; // total +35%
    structureCostPercent -= 9; // total -32%
    attackSpeedPercent -= 2; // total -10%
    scienceRatePercent -= 2; // total -10%
  }

  // --- Scientific Path: Hyper-Tech, R&D Discounts, Precision Warfare & Sky Dominance ---
  const sci = progress.scientificLevel;
  if (sci >= 1) {
    scienceRatePercent += 50;
    defenderSlowPercent -= 12;
    structureCostPercent -= 10;
    troopRegenPercent -= 5;
    civilianTaxPercent -= 5;
  }
  if (sci >= 2) {
    samRangePercent += 35;
    samCooldownPercent -= 30;
    attackerLossPercent -= 15;
    structureCostPercent -= 6; // total -16%
    tradeIncomePercent += 15;
    troopRegenPercent -= 2; // total -7%
    civilianTaxPercent -= 3; // total -8%
  }
  if (sci >= 3) {
    scienceRatePercent += 50; // total +100%
    defenderSlowPercent -= 15; // total -27%
    nukeBlastRadiusPercent += 18;
    siloCooldownPercent -= 15;
    troopRegenPercent += 15; // net +8%
    maxTroopsPercent += 20;
    structureCostPercent -= 8; // total -24%
    stabilityTargetDelta -= 4;
    attackSpeedPercent -= 4;
  }
  if (sci >= 4) {
    scienceRatePercent += 60; // total +160%
    samRangePercent += 35; // total +70%
    samCooldownPercent -= 25; // total -55%
    incomingNukeSlowPercent -= 35;
    nukeBlastRadiusPercent += 12; // total +30%
    siloCooldownPercent -= 10; // total -25%
    nukeSpeedPercent += 20;
    attackerLossPercent -= 10; // total -25%
    maxTroopsPercent += 15; // total +35%
    structureCostPercent -= 6; // total -30%
    tradeIncomePercent += 20; // total +35%
    stabilityTargetDelta -= 2; // total -6
    civilianTaxPercent -= 4; // total -12%
  }

  return {
    troopRegenPercent: Math.max(50, troopRegenPercent),
    maxTroopsPercent: Math.max(60, maxTroopsPercent),
    attackerLossPercent: Math.max(40, attackerLossPercent),
    attackSpeedPercent: Math.max(50, attackSpeedPercent),
    defenderSlowPercent: Math.max(40, defenderSlowPercent),
    stabilityTargetDelta,
    overexpansionStrainPercent: Math.max(20, overexpansionStrainPercent),
    civilianTaxPercent: Math.max(50, civilianTaxPercent),
    tradeIncomePercent: Math.max(50, tradeIncomePercent),
    structureCostPercent: Math.max(50, structureCostPercent),
    civilianGrowthPercent: Math.max(50, civilianGrowthPercent),
    scienceRatePercent: Math.max(50, scienceRatePercent),
    samRangePercent: Math.max(100, samRangePercent),
    samCooldownPercent: Math.max(35, samCooldownPercent),
    siloCooldownPercent: Math.max(35, siloCooldownPercent),
    nukeSpeedPercent: Math.max(50, nukeSpeedPercent),
    incomingNukeSlowPercent: Math.max(35, incomingNukeSlowPercent),
    nukeBlastRadiusPercent: Math.max(80, nukeBlastRadiusPercent),
  };
}
