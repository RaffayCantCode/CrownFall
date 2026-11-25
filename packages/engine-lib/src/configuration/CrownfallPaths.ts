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
      baseScienceCost: 150,
      baseGoldCost: 50_000n,
      primaryOnly: false,
      immediateReservePercent: 8,
      immediateMaxTroops: 40_000,
      immediateStabilityBonus: 0,
      immediateCivilianBonus: 0,
      nameKey: "crownfall.path.military.t1.name",
      proKey: "crownfall.path.military.t1.pro",
      conKey: "crownfall.path.military.t1.con",
    },
    {
      tier: 2,
      baseScienceCost: 350,
      baseGoldCost: 100_000n,
      primaryOnly: false,
      immediateReservePercent: 10,
      immediateMaxTroops: 80_000,
      immediateStabilityBonus: 0,
      immediateCivilianBonus: 0,
      nameKey: "crownfall.path.military.t2.name",
      proKey: "crownfall.path.military.t2.pro",
      conKey: "crownfall.path.military.t2.con",
    },
    {
      tier: 3,
      baseScienceCost: 700,
      baseGoldCost: 175_000n,
      primaryOnly: true,
      immediateReservePercent: 12,
      immediateMaxTroops: 140_000,
      immediateStabilityBonus: 0,
      immediateCivilianBonus: 0,
      nameKey: "crownfall.path.military.t3.name",
      proKey: "crownfall.path.military.t3.pro",
      conKey: "crownfall.path.military.t3.con",
    },
    {
      tier: 4,
      baseScienceCost: 1200,
      baseGoldCost: 275_000n,
      primaryOnly: true,
      immediateReservePercent: 15,
      immediateMaxTroops: 220_000,
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
      baseScienceCost: 150,
      baseGoldCost: 50_000n,
      primaryOnly: false,
      immediateReservePercent: 0,
      immediateMaxTroops: 0,
      immediateStabilityBonus: 8,
      immediateCivilianBonus: 10_000,
      nameKey: "crownfall.path.political.t1.name",
      proKey: "crownfall.path.political.t1.pro",
      conKey: "crownfall.path.political.t1.con",
    },
    {
      tier: 2,
      baseScienceCost: 350,
      baseGoldCost: 100_000n,
      primaryOnly: false,
      immediateReservePercent: 0,
      immediateMaxTroops: 0,
      immediateStabilityBonus: 8,
      immediateCivilianBonus: 20_000,
      nameKey: "crownfall.path.political.t2.name",
      proKey: "crownfall.path.political.t2.pro",
      conKey: "crownfall.path.political.t2.con",
    },
    {
      tier: 3,
      baseScienceCost: 700,
      baseGoldCost: 175_000n,
      primaryOnly: true,
      immediateReservePercent: 8,
      immediateMaxTroops: 100_000,
      immediateStabilityBonus: 10,
      immediateCivilianBonus: 35_000,
      nameKey: "crownfall.path.political.t3.name",
      proKey: "crownfall.path.political.t3.pro",
      conKey: "crownfall.path.political.t3.con",
    },
    {
      tier: 4,
      baseScienceCost: 1200,
      baseGoldCost: 275_000n,
      primaryOnly: true,
      immediateReservePercent: 10,
      immediateMaxTroops: 150_000,
      immediateStabilityBonus: 12,
      immediateCivilianBonus: 50_000,
      nameKey: "crownfall.path.political.t4.name",
      proKey: "crownfall.path.political.t4.pro",
      conKey: "crownfall.path.political.t4.con",
    },
  ],
  [DevelopmentPath.Scientific]: [
    {
      tier: 1,
      baseScienceCost: 150,
      baseGoldCost: 50_000n,
      primaryOnly: false,
      immediateReservePercent: 0,
      immediateMaxTroops: 0,
      immediateStabilityBonus: 6,
      immediateCivilianBonus: 5_000,
      nameKey: "crownfall.path.scientific.t1.name",
      proKey: "crownfall.path.scientific.t1.pro",
      conKey: "crownfall.path.scientific.t1.con",
    },
    {
      tier: 2,
      baseScienceCost: 350,
      baseGoldCost: 100_000n,
      primaryOnly: false,
      immediateReservePercent: 0,
      immediateMaxTroops: 0,
      immediateStabilityBonus: 6,
      immediateCivilianBonus: 10_000,
      nameKey: "crownfall.path.scientific.t2.name",
      proKey: "crownfall.path.scientific.t2.pro",
      conKey: "crownfall.path.scientific.t2.con",
    },
    {
      tier: 3,
      baseScienceCost: 700,
      baseGoldCost: 175_000n,
      primaryOnly: true,
      immediateReservePercent: 8,
      immediateMaxTroops: 90_000,
      immediateStabilityBonus: 0,
      immediateCivilianBonus: 15_000,
      nameKey: "crownfall.path.scientific.t3.name",
      proKey: "crownfall.path.scientific.t3.pro",
      conKey: "crownfall.path.scientific.t3.con",
    },
    {
      tier: 4,
      baseScienceCost: 1200,
      baseGoldCost: 275_000n,
      primaryOnly: true,
      immediateReservePercent: 10,
      immediateMaxTroops: 140_000,
      immediateStabilityBonus: 0,
      immediateCivilianBonus: 25_000,
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
    troopRegenPercent += 18;
    maxTroopsPercent += 10;
    attackSpeedPercent += 8;
    stabilityTargetDelta -= 5;
    scienceRatePercent -= 6;
  }
  if (mil >= 2) {
    troopRegenPercent += 7; // total +25%
    maxTroopsPercent += 10; // total +20%
    attackerLossPercent -= 14;
    attackSpeedPercent += 8; // total +16%
    structureCostPercent -= 10; // cheaper military & infrastructure builds
    stabilityTargetDelta -= 3; // total -8
    civilianTaxPercent -= 6;
    overexpansionStrainPercent += 12;
  }
  if (mil >= 3) {
    maxTroopsPercent += 12; // total +32%
    attackerLossPercent -= 8; // total -22%
    siloCooldownPercent -= 15; // faster missile silos
    nukeSpeedPercent += 18; // supersonic ballistic delivery
    structureCostPercent -= 5; // total -15%
    stabilityTargetDelta -= 4; // total -12
    scienceRatePercent -= 4; // total -10%
    civilianTaxPercent -= 4; // total -10%
  }
  if (mil >= 4) {
    troopRegenPercent += 15; // total +40%
    maxTroopsPercent += 13; // total +45%
    attackerLossPercent -= 8; // total -30%
    attackSpeedPercent += 12; // total +28%
    siloCooldownPercent -= 10; // total -25% silo reload (75)
    nukeSpeedPercent += 10; // total +28% missile speed (128)
    structureCostPercent -= 5; // total -20%
    stabilityTargetDelta -= 3; // total -15
    overexpansionStrainPercent += 13; // total +25%
    civilianTaxPercent -= 2; // total -12%
    scienceRatePercent -= 4; // total -14%
  }

  // --- Political Path: Imperial Treasury, Trade Wealth, Civic Discounts & Hegemony ---
  const pol = progress.politicalLevel;
  if (pol >= 1) {
    stabilityTargetDelta += 12;
    overexpansionStrainPercent -= 25;
    civilianTaxPercent += 20;
    tradeIncomePercent += 15;
    attackSpeedPercent -= 4;
  }
  if (pol >= 2) {
    civilianTaxPercent += 20; // total +40%
    tradeIncomePercent += 15; // total +30%
    civilianGrowthPercent += 25;
    defenderSlowPercent -= 15; // fortified sovereign borders
    structureCostPercent -= 12;
    attackSpeedPercent -= 2; // total -6%
    attackerLossPercent += 4;
  }
  if (pol >= 3) {
    stabilityTargetDelta += 8; // total +20
    overexpansionStrainPercent -= 25; // total -50%
    defenderSlowPercent -= 10; // total -25% invader speed
    maxTroopsPercent += 15;
    troopRegenPercent += 15; // civic volunteer levies
    structureCostPercent -= 6; // total -18%
    attackerLossPercent += 1; // total +5%
    scienceRatePercent -= 6;
  }
  if (pol >= 4) {
    stabilityTargetDelta += 8; // total +28
    overexpansionStrainPercent -= 20; // total -70%
    civilianTaxPercent += 25; // total +65%
    tradeIncomePercent += 20; // total +50%
    civilianGrowthPercent += 20; // total +45%
    defenderSlowPercent -= 7; // total -32% invader speed
    maxTroopsPercent += 10; // total +25%
    structureCostPercent -= 7; // total -25%
    attackSpeedPercent -= 2; // total -8%
    scienceRatePercent -= 2; // total -8%
  }

  // --- Scientific Path: Hyper-Tech, R&D Discounts, Precision Warfare & Sky Dominance ---
  const sci = progress.scientificLevel;
  if (sci >= 1) {
    scienceRatePercent += 40;
    defenderSlowPercent -= 10;
    structureCostPercent -= 8;
    troopRegenPercent -= 5;
    civilianTaxPercent -= 4;
  }
  if (sci >= 2) {
    samRangePercent += 30;
    samCooldownPercent -= 25;
    attackerLossPercent -= 12; // precision targeting lowers combat losses
    structureCostPercent -= 4; // total -12%
    tradeIncomePercent += 10;
    troopRegenPercent -= 1; // total -6%
    civilianTaxPercent -= 2; // total -6%
  }
  if (sci >= 3) {
    scienceRatePercent += 35; // total +75%
    defenderSlowPercent -= 12; // total -22%
    nukeBlastRadiusPercent += 14; // quantum warheads
    siloCooldownPercent -= 12;
    troopRegenPercent += 12; // drone logistics -> net +6% regen
    maxTroopsPercent += 15;
    structureCostPercent -= 6; // total -18%
    stabilityTargetDelta -= 4;
    attackSpeedPercent -= 4;
  }
  if (sci >= 4) {
    scienceRatePercent += 35; // total +110%
    samRangePercent += 25; // total +55%
    samCooldownPercent -= 20; // total -45%
    incomingNukeSlowPercent -= 30; // orbital EW slows enemy missiles by 30% (70)
    nukeBlastRadiusPercent += 8; // total +22% precision blast radius (122)
    siloCooldownPercent -= 8; // total -20%
    nukeSpeedPercent += 15;
    attackerLossPercent -= 8; // total -20% precision strike losses
    maxTroopsPercent += 10; // total +25%
    structureCostPercent -= 4; // total -22%
    tradeIncomePercent += 15; // total +25%
    stabilityTargetDelta -= 2; // total -6
    civilianTaxPercent -= 4; // total -10%
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
