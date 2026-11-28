import { stabilityBand, type StabilityBand } from "./CrownfallConfig";

/**
 * Crownfall Phase 5: Internal Crises, Population Migration & Rebellions.
 *
 * All calculations use pure integer arithmetic so every lockstep client
 * produces bit-identical results.
 */
export const CROWNFALL_CRISIS_CONFIG = {
  /** Tax efficiency multipliers by stability band (percent). */
  unrestTaxPenaltyPercent: 85,
  crisisTaxPenaltyPercent: 65,
  rebellionTaxPenaltyPercent: 50,

  /** Troop regeneration multiplier during Unrest / Crisis / Rebellion (percent). */
  unrestTroopRegenPercent: 90,
  crisisTroopRegenPercent: 72,
  rebellionTroopRegenPercent: 55,

  /** Civilian emigration rate in basis points per second (10_000 = 100%). */
  unrestEmigrationBps: 35, // 0.35%/sec
  crisisEmigrationBps: 90, // 0.90%/sec
  rebellionEmigrationBps: 150, // 1.50%/sec

  /** Minimum stability a bordering nation needs to attract fleeing civilians. */
  stableNeighborMinStability: 65,
  /** Percentage of fleeing civilians who settle in stable bordering nations. */
  neighborMigrationSharePercent: 60,

  /** Minimum owned tiles before a nation can suffer a territorial rebellion. */
  minTilesForRebellion: 80,
  /** Rebellion meter buildup per second while in Crisis (15..34) or Rebellion (<15). */
  rebellionMeterGainCrisis: 5,
  rebellionMeterGainCritical: 12,
  /** Rebellion meter decay per second while Stable or Unrest (>=35). */
  rebellionMeterDecayPerSec: 5,
  /** Rebellion meter threshold that triggers an advance warning notification. */
  rebellionWarningThreshold: 50,
  /** Cooldown in ticks after a rebellion erupts (120 seconds at 10Hz). */
  rebellionCooldownTicks: 1200,
  /** Stability relief granted immediately after a breakaway rebellion forms. */
  rebellionStabilityRelief: 20,
  /** Share of tiles that secede in a rebellion (percent), capped for bounded BFS. */
  rebellionTileSharePercent: 18,
  rebellionMaxTilesPerUprising: 350,
  rebellionMinRemainingTiles: 10,
  /** Share of troops taken by the breakaway rebels (percent). */
  rebellionTroopSharePercent: 25,
} as const;

/**
 * Returns the troop regeneration multiplier (percent) for the current stability & fiscal state.
 */
export function crisisTroopRegenPercent(
  stability: number,
  inFiscalDeficit: boolean = false,
): number {
  const band: StabilityBand = stabilityBand(stability);
  let pct = 100;
  if (band === "rebellion") {
    pct = CROWNFALL_CRISIS_CONFIG.rebellionTroopRegenPercent;
  } else if (band === "crisis") {
    pct = CROWNFALL_CRISIS_CONFIG.crisisTroopRegenPercent;
  } else if (band === "unrest") {
    pct = CROWNFALL_CRISIS_CONFIG.unrestTroopRegenPercent;
  }
  if (inFiscalDeficit) {
    pct = Math.max(35, Math.floor((pct * 75) / 100));
  }
  return pct;
}

/**
 * Returns the combat attacker-loss multiplier (percent; >100 = higher losses, <100 = high-morale bonus)
 * driven by national stability and military fiscal readiness.
 */
export function crisisAttackerLossPercent(
  stability: number,
  inFiscalDeficit: boolean = false,
): number {
  const band: StabilityBand = stabilityBand(stability);
  let pct = stability >= 78 ? 88 : 100;
  if (band === "unrest") {
    pct = 104;
  } else if (band === "crisis") {
    pct = 115;
  } else if (band === "rebellion") {
    pct = 128;
  }
  if (inFiscalDeficit) {
    pct = Math.max(116, pct + 16);
  }
  return pct;
}

/**
 * Returns the offensive push-speed multiplier (percent; >100 = faster conquest, <100 = slower campaign push)
 * driven by national morale, stability, and military supply lines.
 */
export function crisisAttackSpeedPercent(
  stability: number,
  inFiscalDeficit: boolean = false,
): number {
  const band: StabilityBand = stabilityBand(stability);
  let pct = stability >= 78 ? 115 : 104;
  if (band === "unrest") {
    pct = 100;
  } else if (band === "crisis") {
    pct = 90;
  } else if (band === "rebellion") {
    pct = 82;
  }
  if (inFiscalDeficit) {
    pct = Math.min(84, Math.max(55, pct - 20));
  }
  return pct;
}

/**
 * Computes how many civilians emigrate this second due to low stability.
 * Returns 0 when the nation is Stable (>= 60).
 */
export function computeEmigrationPerSecond(
  civilianPop: number,
  stability: number,
): number {
  if (civilianPop <= 0) return 0;
  const band = stabilityBand(stability);
  let bps = 0;
  if (band === "unrest") {
    bps = CROWNFALL_CRISIS_CONFIG.unrestEmigrationBps;
  } else if (band === "crisis") {
    bps = CROWNFALL_CRISIS_CONFIG.crisisEmigrationBps;
  } else if (band === "rebellion") {
    bps = CROWNFALL_CRISIS_CONFIG.rebellionEmigrationBps;
  } else {
    return 0;
  }
  return Math.min(civilianPop, Math.floor((civilianPop * bps) / 10_000));
}

/**
 * Computes how many fleeing civilians settle in each stable bordering neighbor.
 */
export function computeNeighborMigrationShare(
  emigrants: number,
  stableNeighborCount: number,
): number {
  if (emigrants <= 0 || stableNeighborCount <= 0) return 0;
  const totalSettling = Math.floor(
    (emigrants * CROWNFALL_CRISIS_CONFIG.neighborMigrationSharePercent) / 100,
  );
  return Math.floor(totalSettling / stableNeighborCount);
}

/**
 * Advances the deterministic rebellion meter (0..100) by one 1Hz step.
 */
export function nextRebellionMeter(
  currentMeter: number,
  stability: number,
  numTilesOwned: number,
  cooldownTicks: number,
): number {
  if (cooldownTicks > 0) {
    return Math.max(
      0,
      currentMeter - CROWNFALL_CRISIS_CONFIG.rebellionMeterDecayPerSec,
    );
  }
  if (numTilesOwned < CROWNFALL_CRISIS_CONFIG.minTilesForRebellion) {
    return Math.max(
      0,
      currentMeter - CROWNFALL_CRISIS_CONFIG.rebellionMeterDecayPerSec,
    );
  }
  const band = stabilityBand(stability);
  if (band === "rebellion") {
    return Math.min(
      100,
      currentMeter + CROWNFALL_CRISIS_CONFIG.rebellionMeterGainCritical,
    );
  }
  if (band === "crisis") {
    return Math.min(
      100,
      currentMeter + CROWNFALL_CRISIS_CONFIG.rebellionMeterGainCrisis,
    );
  }
  return Math.max(
    0,
    currentMeter - CROWNFALL_CRISIS_CONFIG.rebellionMeterDecayPerSec,
  );
}
