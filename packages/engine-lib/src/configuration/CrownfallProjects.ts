import {
  DevelopmentPath,
  Gold,
  NationalProject,
} from "@openfront/engine-api/game/GameTypes";
import {
  type CrownfallPathModifiers,
  pathLevelFor,
  type PathProgress,
} from "./CrownfallPaths";

export interface NationalProjectDefinition {
  id: NationalProject;
  requiredPath: DevelopmentPath;
  requiredTier: number;
  scienceCost: number;
  goldCost: Gold;
  durationTicks: number; // 10 ticks = 1 second
  cooldownTicks: number;
  immediateStabilityDelta: number;
  immediateRebellionDelta: number;
  mobilisationCapPercent: number;
  mobilisationMaxTroops: number;
  nameKey: string;
  proKey: string;
  conKey: string;
  modifiers: Partial<CrownfallPathModifiers>;
}

export const ALL_NATIONAL_PROJECTS: readonly NationalProjectDefinition[] = [
  {
    id: NationalProject.SurgeMobilisation,
    requiredPath: DevelopmentPath.Military,
    requiredTier: 2,
    scienceCost: 120,
    goldCost: 60_000n,
    durationTicks: 200, // 20s
    cooldownTicks: 600, // 60s
    immediateStabilityDelta: -8,
    immediateRebellionDelta: 0,
    mobilisationCapPercent: 15,
    mobilisationMaxTroops: 150_000,
    nameKey: "crownfall.project.surge_mobilisation.name",
    proKey: "crownfall.project.surge_mobilisation.pro",
    conKey: "crownfall.project.surge_mobilisation.con",
    modifiers: {
      attackSpeedPercent: 20,
      attackerLossPercent: -15,
    },
  },
  {
    id: NationalProject.NationalReconciliation,
    requiredPath: DevelopmentPath.Political,
    requiredTier: 2,
    scienceCost: 120,
    goldCost: 60_000n,
    durationTicks: 200, // 20s
    cooldownTicks: 600, // 60s
    immediateStabilityDelta: 15,
    immediateRebellionDelta: -40,
    mobilisationCapPercent: 0,
    mobilisationMaxTroops: 0,
    nameKey: "crownfall.project.national_reconciliation.name",
    proKey: "crownfall.project.national_reconciliation.pro",
    conKey: "crownfall.project.national_reconciliation.con",
    modifiers: {
      civilianTaxPercent: 25,
      civilianGrowthPercent: 25,
      attackSpeedPercent: -15,
    },
  },
  {
    id: NationalProject.EmpOverdrive,
    requiredPath: DevelopmentPath.Scientific,
    requiredTier: 2,
    scienceCost: 150,
    goldCost: 80_000n,
    durationTicks: 200, // 20s
    cooldownTicks: 600, // 60s
    immediateStabilityDelta: -5,
    immediateRebellionDelta: 0,
    mobilisationCapPercent: 0,
    mobilisationMaxTroops: 0,
    nameKey: "crownfall.project.emp_overdrive.name",
    proKey: "crownfall.project.emp_overdrive.pro",
    conKey: "crownfall.project.emp_overdrive.con",
    modifiers: {
      samRangePercent: 40,
      samCooldownPercent: -50,
      defenderSlowPercent: -30,
      incomingNukeSlowPercent: -25,
    },
  },
];

export const NATIONAL_PROJECTS_BY_ID: Record<
  NationalProject,
  NationalProjectDefinition
> = {
  [NationalProject.SurgeMobilisation]: ALL_NATIONAL_PROJECTS[0],
  [NationalProject.NationalReconciliation]: ALL_NATIONAL_PROJECTS[1],
  [NationalProject.EmpOverdrive]: ALL_NATIONAL_PROJECTS[2],
};

export function isProjectUnlocked(
  progress: PathProgress,
  project: NationalProject,
): boolean {
  const def = NATIONAL_PROJECTS_BY_ID[project];
  return pathLevelFor(progress, def.requiredPath) >= def.requiredTier;
}

export function applyActiveProjectModifiers(
  base: CrownfallPathModifiers,
  activeProject: NationalProject | null,
): CrownfallPathModifiers {
  if (activeProject === null) return base;
  const m = NATIONAL_PROJECTS_BY_ID[activeProject].modifiers;
  return {
    troopRegenPercent: Math.max(
      40,
      base.troopRegenPercent + (m.troopRegenPercent ?? 0),
    ),
    attackerLossPercent: Math.max(
      40,
      base.attackerLossPercent + (m.attackerLossPercent ?? 0),
    ),
    attackSpeedPercent: Math.max(
      40,
      base.attackSpeedPercent + (m.attackSpeedPercent ?? 0),
    ),
    defenderSlowPercent: Math.max(
      40,
      base.defenderSlowPercent + (m.defenderSlowPercent ?? 0),
    ),
    stabilityTargetDelta:
      base.stabilityTargetDelta + (m.stabilityTargetDelta ?? 0),
    overexpansionStrainPercent: Math.max(
      20,
      base.overexpansionStrainPercent + (m.overexpansionStrainPercent ?? 0),
    ),
    civilianTaxPercent: Math.max(
      40,
      base.civilianTaxPercent + (m.civilianTaxPercent ?? 0),
    ),
    civilianGrowthPercent: Math.max(
      40,
      base.civilianGrowthPercent + (m.civilianGrowthPercent ?? 0),
    ),
    scienceRatePercent: Math.max(
      40,
      base.scienceRatePercent + (m.scienceRatePercent ?? 0),
    ),
    samRangePercent: Math.max(
      80,
      base.samRangePercent + (m.samRangePercent ?? 0),
    ),
    samCooldownPercent: Math.max(
      25,
      base.samCooldownPercent + (m.samCooldownPercent ?? 0),
    ),
    siloCooldownPercent: Math.max(
      30,
      base.siloCooldownPercent + (m.siloCooldownPercent ?? 0),
    ),
    nukeSpeedPercent: Math.max(
      50,
      base.nukeSpeedPercent + (m.nukeSpeedPercent ?? 0),
    ),
    incomingNukeSlowPercent: Math.max(
      30,
      base.incomingNukeSlowPercent + (m.incomingNukeSlowPercent ?? 0),
    ),
    nukeBlastRadiusPercent: Math.max(
      80,
      base.nukeBlastRadiusPercent + (m.nukeBlastRadiusPercent ?? 0),
    ),
  };
}
