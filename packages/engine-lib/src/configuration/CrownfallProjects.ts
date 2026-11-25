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
  immediateGoldGrant: Gold;
  immediateScienceGrant: number;
  immediateCivilianGrant: number;
  mobilisationCapPercent: number;
  mobilisationMaxTroops: number;
  nameKey: string;
  proKey: string;
  conKey: string;
  modifiers: Partial<CrownfallPathModifiers>;
}

export const ALL_NATIONAL_PROJECTS: readonly NationalProjectDefinition[] = [
  // ================= MILITARY DOCTRINE OPERATIONS (T1–T4) =================
  {
    id: NationalProject.FrontlineConscription,
    requiredPath: DevelopmentPath.Military,
    requiredTier: 1,
    scienceCost: 60,
    goldCost: 35_000n,
    durationTicks: 150, // 15s
    cooldownTicks: 450, // 45s
    immediateStabilityDelta: -5,
    immediateRebellionDelta: 0,
    immediateGoldGrant: 0n,
    immediateScienceGrant: 0,
    immediateCivilianGrant: 0,
    mobilisationCapPercent: 10,
    mobilisationMaxTroops: 80_000,
    nameKey: "crownfall.project.frontline_conscription.name",
    proKey: "crownfall.project.frontline_conscription.pro",
    conKey: "crownfall.project.frontline_conscription.con",
    modifiers: {
      troopRegenPercent: 25,
      attackSpeedPercent: 10,
    },
  },
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
    immediateGoldGrant: 0n,
    immediateScienceGrant: 0,
    immediateCivilianGrant: 0,
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
    id: NationalProject.ArmoredSpearhead,
    requiredPath: DevelopmentPath.Military,
    requiredTier: 3,
    scienceCost: 200,
    goldCost: 120_000n,
    durationTicks: 220, // 22s
    cooldownTicks: 650, // 65s
    immediateStabilityDelta: -6,
    immediateRebellionDelta: 0,
    immediateGoldGrant: 0n,
    immediateScienceGrant: 0,
    immediateCivilianGrant: 0,
    mobilisationCapPercent: 0,
    mobilisationMaxTroops: 0,
    nameKey: "crownfall.project.armored_spearhead.name",
    proKey: "crownfall.project.armored_spearhead.pro",
    conKey: "crownfall.project.armored_spearhead.con",
    modifiers: {
      attackSpeedPercent: 35,
      attackerLossPercent: -30,
      structureCostPercent: -20,
      civilianTaxPercent: -15,
    },
  },
  {
    id: NationalProject.DefconBarrage,
    requiredPath: DevelopmentPath.Military,
    requiredTier: 4,
    scienceCost: 320,
    goldCost: 220_000n,
    durationTicks: 250, // 25s
    cooldownTicks: 750, // 75s
    immediateStabilityDelta: -12,
    immediateRebellionDelta: 0,
    immediateGoldGrant: 0n,
    immediateScienceGrant: 0,
    immediateCivilianGrant: 0,
    mobilisationCapPercent: 20,
    mobilisationMaxTroops: 250_000,
    nameKey: "crownfall.project.defcon_barrage.name",
    proKey: "crownfall.project.defcon_barrage.pro",
    conKey: "crownfall.project.defcon_barrage.con",
    modifiers: {
      siloCooldownPercent: -50,
      nukeSpeedPercent: 40,
      nukeBlastRadiusPercent: 20,
      maxTroopsPercent: 25,
    },
  },

  // ================= POLITICAL DOCTRINE OPERATIONS (T1–T4) =================
  {
    id: NationalProject.WarBonds,
    requiredPath: DevelopmentPath.Political,
    requiredTier: 1,
    scienceCost: 60,
    goldCost: 0n,
    durationTicks: 180, // 18s
    cooldownTicks: 450, // 45s
    immediateStabilityDelta: -5,
    immediateRebellionDelta: 0,
    immediateGoldGrant: 125_000n,
    immediateScienceGrant: 0,
    immediateCivilianGrant: 0,
    mobilisationCapPercent: 0,
    mobilisationMaxTroops: 0,
    nameKey: "crownfall.project.war_bonds.name",
    proKey: "crownfall.project.war_bonds.pro",
    conKey: "crownfall.project.war_bonds.con",
    modifiers: {
      civilianTaxPercent: 35,
      tradeIncomePercent: 25,
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
    immediateGoldGrant: 0n,
    immediateScienceGrant: 0,
    immediateCivilianGrant: 0,
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
    id: NationalProject.SovereignBastion,
    requiredPath: DevelopmentPath.Political,
    requiredTier: 3,
    scienceCost: 180,
    goldCost: 100_000n,
    durationTicks: 240, // 24s
    cooldownTicks: 600, // 60s
    immediateStabilityDelta: 8,
    immediateRebellionDelta: -20,
    immediateGoldGrant: 0n,
    immediateScienceGrant: 0,
    immediateCivilianGrant: 0,
    mobilisationCapPercent: 12,
    mobilisationMaxTroops: 120_000,
    nameKey: "crownfall.project.sovereign_bastion.name",
    proKey: "crownfall.project.sovereign_bastion.pro",
    conKey: "crownfall.project.sovereign_bastion.con",
    modifiers: {
      defenderSlowPercent: -35,
      maxTroopsPercent: 25,
      troopRegenPercent: 30,
      structureCostPercent: -25,
      attackSpeedPercent: -18,
    },
  },
  {
    id: NationalProject.ImperialGoldenAge,
    requiredPath: DevelopmentPath.Political,
    requiredTier: 4,
    scienceCost: 300,
    goldCost: 150_000n,
    durationTicks: 300, // 30s
    cooldownTicks: 750, // 75s
    immediateStabilityDelta: 20,
    immediateRebellionDelta: -60,
    immediateGoldGrant: 300_000n,
    immediateScienceGrant: 0,
    immediateCivilianGrant: 40_000,
    mobilisationCapPercent: 0,
    mobilisationMaxTroops: 0,
    nameKey: "crownfall.project.imperial_golden_age.name",
    proKey: "crownfall.project.imperial_golden_age.pro",
    conKey: "crownfall.project.imperial_golden_age.con",
    modifiers: {
      civilianTaxPercent: 60,
      tradeIncomePercent: 50,
      civilianGrowthPercent: 50,
      overexpansionStrainPercent: -40,
      attackSpeedPercent: -10,
    },
  },

  // ================= SCIENTIFIC DOCTRINE OPERATIONS (T1–T4) =================
  {
    id: NationalProject.ResearchGrant,
    requiredPath: DevelopmentPath.Scientific,
    requiredTier: 1,
    scienceCost: 0,
    goldCost: 75_000n,
    durationTicks: 180, // 18s
    cooldownTicks: 450, // 45s
    immediateStabilityDelta: 0,
    immediateRebellionDelta: 0,
    immediateGoldGrant: 0n,
    immediateScienceGrant: 160,
    immediateCivilianGrant: 0,
    mobilisationCapPercent: 0,
    mobilisationMaxTroops: 0,
    nameKey: "crownfall.project.research_grant.name",
    proKey: "crownfall.project.research_grant.pro",
    conKey: "crownfall.project.research_grant.con",
    modifiers: {
      scienceRatePercent: 65,
      civilianTaxPercent: -15,
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
    immediateGoldGrant: 0n,
    immediateScienceGrant: 0,
    immediateCivilianGrant: 0,
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
  {
    id: NationalProject.DroneFoundry,
    requiredPath: DevelopmentPath.Scientific,
    requiredTier: 3,
    scienceCost: 210,
    goldCost: 110_000n,
    durationTicks: 220, // 22s
    cooldownTicks: 600, // 60s
    immediateStabilityDelta: -6,
    immediateRebellionDelta: 0,
    immediateGoldGrant: 0n,
    immediateScienceGrant: 0,
    immediateCivilianGrant: 0,
    mobilisationCapPercent: 10,
    mobilisationMaxTroops: 100_000,
    nameKey: "crownfall.project.drone_foundry.name",
    proKey: "crownfall.project.drone_foundry.pro",
    conKey: "crownfall.project.drone_foundry.con",
    modifiers: {
      structureCostPercent: -35,
      troopRegenPercent: 40,
      attackerLossPercent: -20,
      tradeIncomePercent: 35,
    },
  },
  {
    id: NationalProject.OrbitalAegis,
    requiredPath: DevelopmentPath.Scientific,
    requiredTier: 4,
    scienceCost: 320,
    goldCost: 200_000n,
    durationTicks: 250, // 25s
    cooldownTicks: 750, // 75s
    immediateStabilityDelta: -8,
    immediateRebellionDelta: 0,
    immediateGoldGrant: 0n,
    immediateScienceGrant: 0,
    immediateCivilianGrant: 0,
    mobilisationCapPercent: 0,
    mobilisationMaxTroops: 0,
    nameKey: "crownfall.project.orbital_aegis.name",
    proKey: "crownfall.project.orbital_aegis.pro",
    conKey: "crownfall.project.orbital_aegis.con",
    modifiers: {
      samRangePercent: 75,
      samCooldownPercent: -65,
      incomingNukeSlowPercent: -45,
      nukeBlastRadiusPercent: 30,
      siloCooldownPercent: -35,
    },
  },
];

export const NATIONAL_PROJECTS_BY_ID: Record<
  NationalProject,
  NationalProjectDefinition
> = Object.fromEntries(
  ALL_NATIONAL_PROJECTS.map((def) => [def.id, def]),
) as Record<NationalProject, NationalProjectDefinition>;

export function isProjectUnlocked(
  progress: PathProgress,
  project: NationalProject,
): boolean {
  const def = NATIONAL_PROJECTS_BY_ID[project];
  return pathLevelFor(progress, def.requiredPath) >= def.requiredTier;
}

export function projectsForPath(
  path: DevelopmentPath,
): readonly NationalProjectDefinition[] {
  return ALL_NATIONAL_PROJECTS.filter((def) => def.requiredPath === path);
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
    maxTroopsPercent: Math.max(
      60,
      base.maxTroopsPercent + (m.maxTroopsPercent ?? 0),
    ),
    attackerLossPercent: Math.max(
      35,
      base.attackerLossPercent + (m.attackerLossPercent ?? 0),
    ),
    attackSpeedPercent: Math.max(
      40,
      base.attackSpeedPercent + (m.attackSpeedPercent ?? 0),
    ),
    defenderSlowPercent: Math.max(
      35,
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
    tradeIncomePercent: Math.max(
      40,
      base.tradeIncomePercent + (m.tradeIncomePercent ?? 0),
    ),
    structureCostPercent: Math.max(
      40,
      base.structureCostPercent + (m.structureCostPercent ?? 0),
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
      20,
      base.samCooldownPercent + (m.samCooldownPercent ?? 0),
    ),
    siloCooldownPercent: Math.max(
      25,
      base.siloCooldownPercent + (m.siloCooldownPercent ?? 0),
    ),
    nukeSpeedPercent: Math.max(
      40,
      base.nukeSpeedPercent + (m.nukeSpeedPercent ?? 0),
    ),
    incomingNukeSlowPercent: Math.max(
      25,
      base.incomingNukeSlowPercent + (m.incomingNukeSlowPercent ?? 0),
    ),
    nukeBlastRadiusPercent: Math.max(
      80,
      base.nukeBlastRadiusPercent + (m.nukeBlastRadiusPercent ?? 0),
    ),
  };
}
