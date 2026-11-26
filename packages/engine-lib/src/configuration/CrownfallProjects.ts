import {
  DevelopmentPath,
  Gold,
  NationalProject,
} from "@openfront/engine-api/game/GameTypes";
import { PseudoRandom } from "../PseudoRandom";
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
  // ================= EXPANDED RANDOMIZED OPERATIONS POOL =================
  {
    id: NationalProject.ParatrooperDrop,
    requiredPath: DevelopmentPath.Military,
    requiredTier: 1,
    scienceCost: 70,
    goldCost: 45_000n,
    durationTicks: 160,
    cooldownTicks: 450,
    immediateStabilityDelta: -6,
    immediateRebellionDelta: 0,
    immediateGoldGrant: 0n,
    immediateScienceGrant: 0,
    immediateCivilianGrant: 0,
    mobilisationCapPercent: 12,
    mobilisationMaxTroops: 95_000,
    nameKey: "crownfall.project.paratrooper_drop.name",
    proKey: "crownfall.project.paratrooper_drop.pro",
    conKey: "crownfall.project.paratrooper_drop.con",
    modifiers: {
      attackSpeedPercent: 30,
      attackerLossPercent: -10,
    },
  },
  {
    id: NationalProject.BunkerNetwork,
    requiredPath: DevelopmentPath.Military,
    requiredTier: 2,
    scienceCost: 130,
    goldCost: 70_000n,
    durationTicks: 220,
    cooldownTicks: 550,
    immediateStabilityDelta: 0,
    immediateRebellionDelta: 0,
    immediateGoldGrant: 0n,
    immediateScienceGrant: 0,
    immediateCivilianGrant: 0,
    mobilisationCapPercent: 0,
    mobilisationMaxTroops: 0,
    nameKey: "crownfall.project.bunker_network.name",
    proKey: "crownfall.project.bunker_network.pro",
    conKey: "crownfall.project.bunker_network.con",
    modifiers: {
      defenderSlowPercent: -40,
      samRangePercent: 25,
      structureCostPercent: -20,
      attackSpeedPercent: -15,
    },
  },
  {
    id: NationalProject.ScorchedEarth,
    requiredPath: DevelopmentPath.Military,
    requiredTier: 3,
    scienceCost: 220,
    goldCost: 130_000n,
    durationTicks: 240,
    cooldownTicks: 650,
    immediateStabilityDelta: -10,
    immediateRebellionDelta: 0,
    immediateGoldGrant: 0n,
    immediateScienceGrant: 0,
    immediateCivilianGrant: 0,
    mobilisationCapPercent: 10,
    mobilisationMaxTroops: 140_000,
    nameKey: "crownfall.project.scorched_earth.name",
    proKey: "crownfall.project.scorched_earth.pro",
    conKey: "crownfall.project.scorched_earth.con",
    modifiers: {
      defenderSlowPercent: -50,
      attackerLossPercent: -25,
      civilianTaxPercent: -25,
    },
  },
  {
    id: NationalProject.ThermonuclearReadiness,
    requiredPath: DevelopmentPath.Military,
    requiredTier: 4,
    scienceCost: 350,
    goldCost: 250_000n,
    durationTicks: 260,
    cooldownTicks: 750,
    immediateStabilityDelta: -15,
    immediateRebellionDelta: 0,
    immediateGoldGrant: 0n,
    immediateScienceGrant: 0,
    immediateCivilianGrant: 0,
    mobilisationCapPercent: 0,
    mobilisationMaxTroops: 0,
    nameKey: "crownfall.project.thermonuclear_readiness.name",
    proKey: "crownfall.project.thermonuclear_readiness.pro",
    conKey: "crownfall.project.thermonuclear_readiness.con",
    modifiers: {
      siloCooldownPercent: -60,
      nukeBlastRadiusPercent: 35,
      nukeSpeedPercent: 35,
      samRangePercent: 30,
    },
  },
  {
    id: NationalProject.TradeFleetCharter,
    requiredPath: DevelopmentPath.Political,
    requiredTier: 1,
    scienceCost: 65,
    goldCost: 30_000n,
    durationTicks: 200,
    cooldownTicks: 450,
    immediateStabilityDelta: 4,
    immediateRebellionDelta: 0,
    immediateGoldGrant: 80_000n,
    immediateScienceGrant: 0,
    immediateCivilianGrant: 0,
    mobilisationCapPercent: 0,
    mobilisationMaxTroops: 0,
    nameKey: "crownfall.project.trade_fleet_charter.name",
    proKey: "crownfall.project.trade_fleet_charter.pro",
    conKey: "crownfall.project.trade_fleet_charter.con",
    modifiers: {
      tradeIncomePercent: 60,
      structureCostPercent: -20,
      troopRegenPercent: -10,
    },
  },
  {
    id: NationalProject.MartialLaw,
    requiredPath: DevelopmentPath.Political,
    requiredTier: 2,
    scienceCost: 110,
    goldCost: 50_000n,
    durationTicks: 200,
    cooldownTicks: 550,
    immediateStabilityDelta: 10,
    immediateRebellionDelta: -50,
    immediateGoldGrant: 0n,
    immediateScienceGrant: 0,
    immediateCivilianGrant: 0,
    mobilisationCapPercent: 8,
    mobilisationMaxTroops: 90_000,
    nameKey: "crownfall.project.martial_law.name",
    proKey: "crownfall.project.martial_law.pro",
    conKey: "crownfall.project.martial_law.con",
    modifiers: {
      maxTroopsPercent: 15,
      troopRegenPercent: 20,
      civilianGrowthPercent: -25,
    },
  },
  {
    id: NationalProject.DiplomaticSubsidy,
    requiredPath: DevelopmentPath.Political,
    requiredTier: 3,
    scienceCost: 190,
    goldCost: 0n,
    durationTicks: 220,
    cooldownTicks: 650,
    immediateStabilityDelta: 12,
    immediateRebellionDelta: -25,
    immediateGoldGrant: 250_000n,
    immediateScienceGrant: 0,
    immediateCivilianGrant: 25_000,
    mobilisationCapPercent: 0,
    mobilisationMaxTroops: 0,
    nameKey: "crownfall.project.diplomatic_subsidy.name",
    proKey: "crownfall.project.diplomatic_subsidy.pro",
    conKey: "crownfall.project.diplomatic_subsidy.con",
    modifiers: {
      civilianTaxPercent: 45,
      attackSpeedPercent: -15,
    },
  },
  {
    id: NationalProject.ContinentalHegemony,
    requiredPath: DevelopmentPath.Political,
    requiredTier: 4,
    scienceCost: 310,
    goldCost: 180_000n,
    durationTicks: 280,
    cooldownTicks: 750,
    immediateStabilityDelta: 15,
    immediateRebellionDelta: -50,
    immediateGoldGrant: 0n,
    immediateScienceGrant: 0,
    immediateCivilianGrant: 30_000,
    mobilisationCapPercent: 15,
    mobilisationMaxTroops: 180_000,
    nameKey: "crownfall.project.continental_hegemony.name",
    proKey: "crownfall.project.continental_hegemony.pro",
    conKey: "crownfall.project.continental_hegemony.con",
    modifiers: {
      overexpansionStrainPercent: -80,
      maxTroopsPercent: 30,
      defenderSlowPercent: -30,
      scienceRatePercent: -15,
    },
  },
  {
    id: NationalProject.CrashResearchProgram,
    requiredPath: DevelopmentPath.Scientific,
    requiredTier: 1,
    scienceCost: 0,
    goldCost: 90_000n,
    durationTicks: 180,
    cooldownTicks: 450,
    immediateStabilityDelta: -4,
    immediateRebellionDelta: 0,
    immediateGoldGrant: 0n,
    immediateScienceGrant: 220,
    immediateCivilianGrant: 0,
    mobilisationCapPercent: 0,
    mobilisationMaxTroops: 0,
    nameKey: "crownfall.project.crash_research_program.name",
    proKey: "crownfall.project.crash_research_program.pro",
    conKey: "crownfall.project.crash_research_program.con",
    modifiers: {
      scienceRatePercent: 80,
      civilianTaxPercent: -20,
    },
  },
  {
    id: NationalProject.CyberBlackout,
    requiredPath: DevelopmentPath.Scientific,
    requiredTier: 2,
    scienceCost: 140,
    goldCost: 75_000n,
    durationTicks: 200,
    cooldownTicks: 580,
    immediateStabilityDelta: -6,
    immediateRebellionDelta: 0,
    immediateGoldGrant: 0n,
    immediateScienceGrant: 0,
    immediateCivilianGrant: 0,
    mobilisationCapPercent: 0,
    mobilisationMaxTroops: 0,
    nameKey: "crownfall.project.cyber_blackout.name",
    proKey: "crownfall.project.cyber_blackout.pro",
    conKey: "crownfall.project.cyber_blackout.con",
    modifiers: {
      incomingNukeSlowPercent: -40,
      defenderSlowPercent: -35,
      siloCooldownPercent: -20,
    },
  },
  {
    id: NationalProject.NaniteConstruction,
    requiredPath: DevelopmentPath.Scientific,
    requiredTier: 3,
    scienceCost: 220,
    goldCost: 100_000n,
    durationTicks: 230,
    cooldownTicks: 620,
    immediateStabilityDelta: -8,
    immediateRebellionDelta: 0,
    immediateGoldGrant: 0n,
    immediateScienceGrant: 0,
    immediateCivilianGrant: 0,
    mobilisationCapPercent: 0,
    mobilisationMaxTroops: 0,
    nameKey: "crownfall.project.nanite_construction.name",
    proKey: "crownfall.project.nanite_construction.pro",
    conKey: "crownfall.project.nanite_construction.con",
    modifiers: {
      structureCostPercent: -45,
      civilianGrowthPercent: 35,
      troopRegenPercent: 35,
    },
  },
  {
    id: NationalProject.ProjectSingularity,
    requiredPath: DevelopmentPath.Scientific,
    requiredTier: 4,
    scienceCost: 340,
    goldCost: 240_000n,
    durationTicks: 260,
    cooldownTicks: 750,
    immediateStabilityDelta: -12,
    immediateRebellionDelta: 0,
    immediateGoldGrant: 0n,
    immediateScienceGrant: 500,
    immediateCivilianGrant: 0,
    mobilisationCapPercent: 12,
    mobilisationMaxTroops: 160_000,
    nameKey: "crownfall.project.project_singularity.name",
    proKey: "crownfall.project.project_singularity.pro",
    conKey: "crownfall.project.project_singularity.con",
    modifiers: {
      scienceRatePercent: 100,
      attackerLossPercent: -40,
      attackSpeedPercent: 25,
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

function hashSeedString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
}

function pickRandomSubset(
  rng: PseudoRandom,
  pool: readonly NationalProjectDefinition[],
  count: number,
): NationalProjectDefinition[] {
  const arr = pool.slice();
  const out: NationalProjectDefinition[] = [];
  while (out.length < count && arr.length > 0) {
    const idx = rng.nextInt(0, arr.length);
    out.push(arr[idx]);
    arr.splice(idx, 1);
  }
  return out;
}

/**
 * Deterministically rolls a fresh, randomized roster of National Operations
 * for a given match & player (`seedKey = "${gameID}:${playerID}"`).
 *
 * - Before choosing a Primary Path: rolls 6 random operations (2 per path,
 *   prioritizing T1–T2 so players can inspect early options).
 * - After choosing a Primary Path: rolls 5 random operations from the Primary
 *   Path (1 per tier T1–T4 + 1 wildcard) plus 3 random T1–T2 secondary-path
 *   operations = 8 unique operations every match!
 */
export function rollMatchOperations(
  seedKey: string,
  primaryPath: DevelopmentPath | null,
): readonly NationalProjectDefinition[] {
  const rng = new PseudoRandom(hashSeedString(seedKey));

  if (primaryPath === null) {
    const out: NationalProjectDefinition[] = [];
    for (const path of [
      DevelopmentPath.Military,
      DevelopmentPath.Political,
      DevelopmentPath.Scientific,
    ]) {
      const earlyPool = ALL_NATIONAL_PROJECTS.filter(
        (p) => p.requiredPath === path && p.requiredTier <= 2,
      );
      out.push(...pickRandomSubset(rng, earlyPool, 2));
    }
    return out;
  }

  const chosen: NationalProjectDefinition[] = [];
  const used = new Set<NationalProject>();
  // Pick 1 random op for each tier T1..T4 of primaryPath so progression is always smooth
  for (const tier of [1, 2, 3, 4]) {
    const tierPool = ALL_NATIONAL_PROJECTS.filter(
      (p) => p.requiredPath === primaryPath && p.requiredTier === tier,
    );
    const picked = pickRandomSubset(rng, tierPool, 1);
    for (const p of picked) {
      chosen.push(p);
      used.add(p.id);
    }
  }
  // Plus 2 random wildcard primary ops
  const remainingPrimary = ALL_NATIONAL_PROJECTS.filter(
    (p) => p.requiredPath === primaryPath && !used.has(p.id),
  );
  for (const p of pickRandomSubset(rng, remainingPrimary, 2)) {
    chosen.push(p);
    used.add(p.id);
  }
  // Plus 2 random cross-path T1–T2 ops (secondary paths cap at T2)
  const crossPool = ALL_NATIONAL_PROJECTS.filter(
    (p) =>
      p.requiredPath !== primaryPath &&
      p.requiredTier <= 2 &&
      !used.has(p.id),
  );
  chosen.push(...pickRandomSubset(rng, crossPool, 2));

  return chosen.sort((a, b) => a.requiredTier - b.requiredTier);
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
