import { AugmentId } from "@openfront/engine-api/game/GameTypes";
import { PseudoRandom } from "../PseudoRandom";
import { type CrownfallPathModifiers } from "./CrownfallPaths";

export const MAX_AUGMENTS_PER_PLAYER = 5;
export const AUGMENT_CHOICES_PER_ROUND = 3;

/**
 * Active-gameplay ticks (after spawn phase) at which synchronized global
 * Augment Drafts trigger for all players simultaneously:
 * Round 1: 1m30s, Round 2: 5m, Round 3: 10m, Round 4: 16m, Round 5: 22m.
 */
export const AUGMENT_ROUND_TICKS: readonly number[] = [
  900, 3000, 6000, 9600, 13200,
] as const;

/**
 * Multiplayer safety timeout (30 seconds = 300 ticks) so an AFK player
 * auto-picks deterministically instead of stalling the lobby forever.
 * Singleplayer has no timeout (waits until the player chooses).
 */
export const MULTIPLAYER_DRAFT_TIMEOUT_TICKS = 300;

export type AugmentCategory = "military" | "economic" | "political" | "science";

export interface AugmentDefinition {
  id: AugmentId;
  category: AugmentCategory;
  nameKey: string;
  proKey: string;
  conKey: string;
  deltas: Partial<CrownfallPathModifiers>;
}

export const AUGMENT_CATALOG: readonly AugmentDefinition[] = [
  {
    id: AugmentId.TotalMobilisation,
    category: "military",
    nameKey: "crownfall.augment.total_mobilisation.name",
    proKey: "crownfall.augment.total_mobilisation.pro",
    conKey: "crownfall.augment.total_mobilisation.con",
    deltas: {
      troopRegenPercent: 25,
      civilianTaxPercent: -15,
      stabilityTargetDelta: -4,
    },
  },
  {
    id: AugmentId.IndustrialPowerhouse,
    category: "economic",
    nameKey: "crownfall.augment.industrial_powerhouse.name",
    proKey: "crownfall.augment.industrial_powerhouse.pro",
    conKey: "crownfall.augment.industrial_powerhouse.con",
    deltas: {
      civilianTaxPercent: 30,
      troopRegenPercent: -8,
      stabilityTargetDelta: -4,
    },
  },
  {
    id: AugmentId.PeoplesFirst,
    category: "political",
    nameKey: "crownfall.augment.peoples_first.name",
    proKey: "crownfall.augment.peoples_first.pro",
    conKey: "crownfall.augment.peoples_first.con",
    deltas: {
      stabilityTargetDelta: 15,
      civilianGrowthPercent: 25,
      attackSpeedPercent: -15,
    },
  },
  {
    id: AugmentId.WarProfiteers,
    category: "economic",
    nameKey: "crownfall.augment.war_profiteers.name",
    proKey: "crownfall.augment.war_profiteers.pro",
    conKey: "crownfall.augment.war_profiteers.con",
    deltas: {
      civilianTaxPercent: 25,
      attackerLossPercent: -12,
      stabilityTargetDelta: -10,
    },
  },
  {
    id: AugmentId.FortressNation,
    category: "military",
    nameKey: "crownfall.augment.fortress_nation.name",
    proKey: "crownfall.augment.fortress_nation.pro",
    conKey: "crownfall.augment.fortress_nation.con",
    deltas: {
      defenderSlowPercent: -25,
      samRangePercent: 20,
      attackSpeedPercent: -15,
      attackerLossPercent: 10,
    },
  },
  {
    id: AugmentId.TechnologicalRace,
    category: "science",
    nameKey: "crownfall.augment.technological_race.name",
    proKey: "crownfall.augment.technological_race.pro",
    conKey: "crownfall.augment.technological_race.con",
    deltas: {
      scienceRatePercent: 50,
      civilianTaxPercent: -15,
    },
  },
  {
    id: AugmentId.RapidExpansion,
    category: "military",
    nameKey: "crownfall.augment.rapid_expansion.name",
    proKey: "crownfall.augment.rapid_expansion.pro",
    conKey: "crownfall.augment.rapid_expansion.con",
    deltas: {
      attackSpeedPercent: 20,
      overexpansionStrainPercent: -35,
      stabilityTargetDelta: -8,
    },
  },
  {
    id: AugmentId.GoldenDiplomacy,
    category: "political",
    nameKey: "crownfall.augment.golden_diplomacy.name",
    proKey: "crownfall.augment.golden_diplomacy.pro",
    conKey: "crownfall.augment.golden_diplomacy.con",
    deltas: {
      stabilityTargetDelta: 10,
      civilianTaxPercent: 20,
      attackerLossPercent: 12,
    },
  },
  {
    id: AugmentId.IronDiscipline,
    category: "military",
    nameKey: "crownfall.augment.iron_discipline.name",
    proKey: "crownfall.augment.iron_discipline.pro",
    conKey: "crownfall.augment.iron_discipline.con",
    deltas: {
      attackerLossPercent: -18,
      stabilityTargetDelta: 6,
      civilianGrowthPercent: -12,
    },
  },
  {
    id: AugmentId.AerospaceCommand,
    category: "science",
    nameKey: "crownfall.augment.aerospace_command.name",
    proKey: "crownfall.augment.aerospace_command.pro",
    conKey: "crownfall.augment.aerospace_command.con",
    deltas: {
      samRangePercent: 35,
      samCooldownPercent: -25,
      troopRegenPercent: -10,
    },
  },
  {
    id: AugmentId.CivicRenaissance,
    category: "science",
    nameKey: "crownfall.augment.civic_renaissance.name",
    proKey: "crownfall.augment.civic_renaissance.pro",
    conKey: "crownfall.augment.civic_renaissance.con",
    deltas: {
      civilianGrowthPercent: 35,
      scienceRatePercent: 30,
      attackSpeedPercent: -10,
    },
  },
  {
    id: AugmentId.BlitzLogistics,
    category: "military",
    nameKey: "crownfall.augment.blitz_logistics.name",
    proKey: "crownfall.augment.blitz_logistics.pro",
    conKey: "crownfall.augment.blitz_logistics.con",
    deltas: {
      attackSpeedPercent: 22,
      troopRegenPercent: 12,
      civilianTaxPercent: -12,
      overexpansionStrainPercent: 15,
    },
  },
] as const;

const AUGMENT_BY_ID = new Map<AugmentId, AugmentDefinition>(
  AUGMENT_CATALOG.map((def) => [def.id, def]),
);

export function getAugmentDefinition(id: AugmentId): AugmentDefinition {
  const def = AUGMENT_BY_ID.get(id);
  if (!def) {
    throw new Error(`Unknown AugmentId: ${id}`);
  }
  return def;
}

/**
 * Deterministically rolls up to `count` distinct augments that the player
 * does not already own, using the engine's seeded PseudoRandom.
 */
export function rollAugmentChoices(
  rng: PseudoRandom,
  owned: readonly AugmentId[],
  count: number = AUGMENT_CHOICES_PER_ROUND,
): AugmentId[] {
  const ownedSet = new Set(owned);
  const pool = AUGMENT_CATALOG.map((a) => a.id).filter(
    (id) => !ownedSet.has(id),
  );
  const chosen: AugmentId[] = [];
  while (chosen.length < count && pool.length > 0) {
    const idx = rng.nextInt(0, pool.length);
    chosen.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return chosen;
}

/**
 * Composes all selected augments onto the base Development Path modifiers
 * using integer-only math and safe lower bounds.
 */
export function applyAugmentModifiers(
  base: CrownfallPathModifiers,
  augments: readonly AugmentId[],
): CrownfallPathModifiers {
  if (augments.length === 0) return base;
  let {
    troopRegenPercent,
    maxTroopsPercent,
    attackerLossPercent,
    attackSpeedPercent,
    defenderSlowPercent,
    stabilityTargetDelta,
    overexpansionStrainPercent,
    civilianTaxPercent,
    tradeIncomePercent,
    structureCostPercent,
    civilianGrowthPercent,
    scienceRatePercent,
    samRangePercent,
    samCooldownPercent,
    siloCooldownPercent,
    nukeSpeedPercent,
    incomingNukeSlowPercent,
    nukeBlastRadiusPercent,
  } = base;

  for (const id of augments) {
    const d = getAugmentDefinition(id).deltas;
    if (d.troopRegenPercent) troopRegenPercent += d.troopRegenPercent;
    if (d.maxTroopsPercent) maxTroopsPercent += d.maxTroopsPercent;
    if (d.attackerLossPercent) attackerLossPercent += d.attackerLossPercent;
    if (d.attackSpeedPercent) attackSpeedPercent += d.attackSpeedPercent;
    if (d.defenderSlowPercent) defenderSlowPercent += d.defenderSlowPercent;
    if (d.stabilityTargetDelta) stabilityTargetDelta += d.stabilityTargetDelta;
    if (d.overexpansionStrainPercent)
      overexpansionStrainPercent += d.overexpansionStrainPercent;
    if (d.civilianTaxPercent) civilianTaxPercent += d.civilianTaxPercent;
    if (d.tradeIncomePercent) tradeIncomePercent += d.tradeIncomePercent;
    if (d.structureCostPercent) structureCostPercent += d.structureCostPercent;
    if (d.civilianGrowthPercent)
      civilianGrowthPercent += d.civilianGrowthPercent;
    if (d.scienceRatePercent) scienceRatePercent += d.scienceRatePercent;
    if (d.samRangePercent) samRangePercent += d.samRangePercent;
    if (d.samCooldownPercent) samCooldownPercent += d.samCooldownPercent;
    if (d.siloCooldownPercent) siloCooldownPercent += d.siloCooldownPercent;
    if (d.nukeSpeedPercent) nukeSpeedPercent += d.nukeSpeedPercent;
    if (d.incomingNukeSlowPercent)
      incomingNukeSlowPercent += d.incomingNukeSlowPercent;
    if (d.nukeBlastRadiusPercent)
      nukeBlastRadiusPercent += d.nukeBlastRadiusPercent;
  }

  return {
    troopRegenPercent: Math.max(40, troopRegenPercent),
    maxTroopsPercent: Math.max(60, maxTroopsPercent),
    attackerLossPercent: Math.max(40, attackerLossPercent),
    attackSpeedPercent: Math.max(40, attackSpeedPercent),
    defenderSlowPercent: Math.max(40, defenderSlowPercent),
    stabilityTargetDelta,
    overexpansionStrainPercent: Math.max(15, overexpansionStrainPercent),
    civilianTaxPercent: Math.max(40, civilianTaxPercent),
    tradeIncomePercent: Math.max(40, tradeIncomePercent),
    structureCostPercent: Math.max(40, structureCostPercent),
    civilianGrowthPercent: Math.max(40, civilianGrowthPercent),
    scienceRatePercent: Math.max(40, scienceRatePercent),
    samRangePercent: Math.max(100, samRangePercent),
    samCooldownPercent: Math.max(35, samCooldownPercent),
    siloCooldownPercent: Math.max(35, siloCooldownPercent),
    nukeSpeedPercent: Math.max(50, nukeSpeedPercent),
    incomingNukeSlowPercent: Math.max(35, incomingNukeSlowPercent),
    nukeBlastRadiusPercent: Math.max(80, nukeBlastRadiusPercent),
  };
}
