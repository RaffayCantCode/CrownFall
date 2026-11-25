import { DevelopmentPath } from "@openfront/engine-api/game/GameTypes";

export const PRIMARY_PATH_MAX_TIER = 4;
export const SECONDARY_PATH_MAX_TIER = 2;
/** Primary path gets a 20% Science cost discount (integer percent = 80). */
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
  primaryOnly: boolean;
  nameKey: string;
  proKey: string;
  conKey: string;
}

export interface CrownfallPathModifiers {
  /** Multiplier (%) on troop replenishment rate (100 = 1.0x). */
  troopRegenPercent: number;
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
  attackerLossPercent: 100,
  attackSpeedPercent: 100,
  defenderSlowPercent: 100,
  stabilityTargetDelta: 0,
  overexpansionStrainPercent: 100,
  civilianTaxPercent: 100,
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
      primaryOnly: false,
      nameKey: "crownfall.path.military.t1.name",
      proKey: "crownfall.path.military.t1.pro",
      conKey: "crownfall.path.military.t1.con",
    },
    {
      tier: 2,
      baseScienceCost: 350,
      primaryOnly: false,
      nameKey: "crownfall.path.military.t2.name",
      proKey: "crownfall.path.military.t2.pro",
      conKey: "crownfall.path.military.t2.con",
    },
    {
      tier: 3,
      baseScienceCost: 700,
      primaryOnly: true,
      nameKey: "crownfall.path.military.t3.name",
      proKey: "crownfall.path.military.t3.pro",
      conKey: "crownfall.path.military.t3.con",
    },
    {
      tier: 4,
      baseScienceCost: 1200,
      primaryOnly: true,
      nameKey: "crownfall.path.military.t4.name",
      proKey: "crownfall.path.military.t4.pro",
      conKey: "crownfall.path.military.t4.con",
    },
  ],
  [DevelopmentPath.Political]: [
    {
      tier: 1,
      baseScienceCost: 150,
      primaryOnly: false,
      nameKey: "crownfall.path.political.t1.name",
      proKey: "crownfall.path.political.t1.pro",
      conKey: "crownfall.path.political.t1.con",
    },
    {
      tier: 2,
      baseScienceCost: 350,
      primaryOnly: false,
      nameKey: "crownfall.path.political.t2.name",
      proKey: "crownfall.path.political.t2.pro",
      conKey: "crownfall.path.political.t2.con",
    },
    {
      tier: 3,
      baseScienceCost: 700,
      primaryOnly: true,
      nameKey: "crownfall.path.political.t3.name",
      proKey: "crownfall.path.political.t3.pro",
      conKey: "crownfall.path.political.t3.con",
    },
    {
      tier: 4,
      baseScienceCost: 1200,
      primaryOnly: true,
      nameKey: "crownfall.path.political.t4.name",
      proKey: "crownfall.path.political.t4.pro",
      conKey: "crownfall.path.political.t4.con",
    },
  ],
  [DevelopmentPath.Scientific]: [
    {
      tier: 1,
      baseScienceCost: 150,
      primaryOnly: false,
      nameKey: "crownfall.path.scientific.t1.name",
      proKey: "crownfall.path.scientific.t1.pro",
      conKey: "crownfall.path.scientific.t1.con",
    },
    {
      tier: 2,
      baseScienceCost: 350,
      primaryOnly: false,
      nameKey: "crownfall.path.scientific.t2.name",
      proKey: "crownfall.path.scientific.t2.pro",
      conKey: "crownfall.path.scientific.t2.con",
    },
    {
      tier: 3,
      baseScienceCost: 700,
      primaryOnly: true,
      nameKey: "crownfall.path.scientific.t3.name",
      proKey: "crownfall.path.scientific.t3.pro",
      conKey: "crownfall.path.scientific.t3.con",
    },
    {
      tier: 4,
      baseScienceCost: 1200,
      primaryOnly: true,
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

/**
 * Pure, integer-only calculation of cumulative modifiers from all unlocked
 * development tiers across the three paths.
 */
export function computeCrownfallPathModifiers(
  progress: PathProgress,
): CrownfallPathModifiers {
  let troopRegenPercent = 100;
  let attackerLossPercent = 100;
  let attackSpeedPercent = 100;
  let defenderSlowPercent = 100;
  let stabilityTargetDelta = 0;
  let overexpansionStrainPercent = 100;
  let civilianTaxPercent = 100;
  let civilianGrowthPercent = 100;
  let scienceRatePercent = 100;
  let samRangePercent = 100;
  let samCooldownPercent = 100;
  let siloCooldownPercent = 100;
  let nukeSpeedPercent = 100;
  let incomingNukeSlowPercent = 100;
  let nukeBlastRadiusPercent = 100;

  // --- Military Path: Blitzkrieg & Conscription ---
  // Explosive offense & supersonic missiles, offset by heavy war exhaustion,
  // overexpansion strain, and Science/tax drain so reckless blobbing risks crisis.
  const mil = progress.militaryLevel;
  if (mil >= 1) {
    troopRegenPercent += 12;
    attackSpeedPercent += 6;
    stabilityTargetDelta -= 6;
    scienceRatePercent -= 8;
  }
  if (mil >= 2) {
    attackerLossPercent -= 10;
    attackSpeedPercent += 8; // total +14%
    stabilityTargetDelta -= 4; // total -10
    civilianTaxPercent -= 8;
    overexpansionStrainPercent += 15;
  }
  if (mil >= 3) {
    attackerLossPercent -= 8; // total -18%
    siloCooldownPercent -= 15; // faster missile silos
    nukeSpeedPercent += 18; // supersonic ballistic delivery
    stabilityTargetDelta -= 5; // total -15
    scienceRatePercent -= 6; // total -14%
    civilianTaxPercent -= 5; // total -13%
  }
  if (mil >= 4) {
    troopRegenPercent += 12; // total +24%
    attackerLossPercent -= 6; // total -24%
    attackSpeedPercent += 8; // total +22%
    siloCooldownPercent -= 10; // total -25% silo reload
    nukeSpeedPercent += 10; // total +28% missile speed
    stabilityTargetDelta -= 5; // total -20
    overexpansionStrainPercent += 20; // total +35% overexpansion strain
    civilianTaxPercent -= 5; // total -18%
    scienceRatePercent -= 6; // total -20%
  }

  // --- Political Path: Imperial Treasury, Fortress Borders & Unbreakable Hegemony ---
  // Massive Gold economy, rapid civilian boom, fortified defensive borders, and
  // effortless Stable Hegemony, offset by deliberate offensive tempo.
  const pol = progress.politicalLevel;
  if (pol >= 1) {
    stabilityTargetDelta += 10;
    overexpansionStrainPercent -= 20;
    civilianTaxPercent += 15;
    attackSpeedPercent -= 4;
  }
  if (pol >= 2) {
    civilianTaxPercent += 15; // total +30%
    civilianGrowthPercent += 20;
    defenderSlowPercent -= 12; // fortified sovereign borders
    attackSpeedPercent -= 4; // total -8%
    attackerLossPercent += 4;
  }
  if (pol >= 3) {
    stabilityTargetDelta += 8; // total +18
    overexpansionStrainPercent -= 25; // total -45%
    defenderSlowPercent -= 10; // total -22% invader speed
    troopRegenPercent += 10; // civic volunteer levies
    attackerLossPercent += 2; // total +6%
    scienceRatePercent -= 8;
  }
  if (pol >= 4) {
    stabilityTargetDelta += 6; // total +24
    overexpansionStrainPercent -= 20; // total -65%
    civilianTaxPercent += 15; // total +45%
    civilianGrowthPercent += 20; // total +40%
    defenderSlowPercent -= 6; // total -28% invader speed
    attackSpeedPercent -= 4; // total -12%
    scienceRatePercent -= 4; // total -12%
  }

  // --- Scientific Path: Hyper-Tech, Precision Warfare & Sky Dominance ---
  // Blistering Science & Operations tempo, precision low-loss strikes, smart
  // border defenses, and impenetrable SAM/EW superweapons, offset by lean early
  // manpower and R&D funding overhead.
  const sci = progress.scientificLevel;
  if (sci >= 1) {
    scienceRatePercent += 35;
    defenderSlowPercent -= 8;
    troopRegenPercent -= 6;
    civilianTaxPercent -= 5;
  }
  if (sci >= 2) {
    samRangePercent += 25;
    samCooldownPercent -= 20;
    attackerLossPercent -= 8; // precision targeting lowers combat losses
    troopRegenPercent -= 2; // total -8%
    civilianTaxPercent -= 5; // total -10%
  }
  if (sci >= 3) {
    scienceRatePercent += 25; // total +60%
    defenderSlowPercent -= 12; // total -20%
    nukeBlastRadiusPercent += 14; // quantum warheads
    siloCooldownPercent -= 12;
    troopRegenPercent += 8; // drone logistics restores early manpower penalty
    stabilityTargetDelta -= 4;
    attackSpeedPercent -= 6;
  }
  if (sci >= 4) {
    scienceRatePercent += 30; // total +90%
    samRangePercent += 25; // total +50%
    samCooldownPercent -= 20; // total -40%
    incomingNukeSlowPercent -= 30; // orbital EW slows enemy missiles by 30%
    nukeBlastRadiusPercent += 8; // total +22% precision blast radius
    siloCooldownPercent -= 8; // total -20%
    nukeSpeedPercent += 15;
    attackerLossPercent -= 6; // total -14% precision strike losses
    stabilityTargetDelta -= 4; // total -8
    civilianTaxPercent -= 6; // total -16%
  }

  return {
    troopRegenPercent: Math.max(50, troopRegenPercent),
    attackerLossPercent: Math.max(50, attackerLossPercent),
    attackSpeedPercent: Math.max(50, attackSpeedPercent),
    defenderSlowPercent: Math.max(50, defenderSlowPercent),
    stabilityTargetDelta,
    overexpansionStrainPercent: Math.max(20, overexpansionStrainPercent),
    civilianTaxPercent: Math.max(50, civilianTaxPercent),
    civilianGrowthPercent: Math.max(50, civilianGrowthPercent),
    scienceRatePercent: Math.max(50, scienceRatePercent),
    samRangePercent: Math.max(100, samRangePercent),
    samCooldownPercent: Math.max(40, samCooldownPercent),
    siloCooldownPercent: Math.max(40, siloCooldownPercent),
    nukeSpeedPercent: Math.max(50, nukeSpeedPercent),
    incomingNukeSlowPercent: Math.max(40, incomingNukeSlowPercent),
    nukeBlastRadiusPercent: Math.max(80, nukeBlastRadiusPercent),
  };
}
