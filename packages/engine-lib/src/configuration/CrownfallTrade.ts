import {
  DevelopmentPath,
  Gold,
  PlayerType,
  TradeAgreementType,
} from "@openfront/engine-api/game/GameTypes";
import { type CrownfallPathModifiers } from "./CrownfallPaths";

export const CROWNFALL_TRADE_CONFIG = {
  maxActiveAgreementsPerPlayer: 3,
  requestDurationTicks: 300, // 30s
  cooldownTicks: 250, // 25s cooldown after reject/cancel
  minAgreementDurationTicks: 150, // 15s minimum before manual cancellation
  foodShipmentPerSec: 15, // 900 Food/min
  minPartnerFoodBufferForExport: 300,
  foodPaymentGoldPerSec: 1_500n as Gold, // 90K Gold/min
  commerceGoldPerSec: 1_800n as Gold, // 108K Gold/min
  researchSciencePerSec: 6, // 360 SCI/min
  researchGoldPerSec: 800n as Gold,
} as const;

/**
 * Resolves a trading partner's effective development specialisation.
 * AI Nations without an explicit primaryPath deterministically specialise
 * by smallID so trading with AI countries also grants meaningful path synergies.
 */
export function effectivePartnerPath(
  primaryPath: DevelopmentPath | null,
  playerType: PlayerType,
  smallID: number,
): DevelopmentPath | null {
  if (primaryPath !== null) {
    return primaryPath;
  }
  if (playerType === PlayerType.Nation) {
    const mod = Math.abs(smallID) % 3;
    if (mod === 0) return DevelopmentPath.Military;
    if (mod === 1) return DevelopmentPath.Political;
    return DevelopmentPath.Scientific;
  }
  return null;
}

/**
 * Computes bidirectional Development-Path Trade Synergies from active
 * international trade partners. Benefits are modest, symmetric in value,
 * and capped by `maxActiveAgreementsPerPlayer` (3).
 */
export function computeTradeSynergyModifiers(
  base: CrownfallPathModifiers,
  myPath: DevelopmentPath | null,
  partnerSpecs: readonly {
    partnerPath: DevelopmentPath | null;
    tradeType: TradeAgreementType;
  }[],
): CrownfallPathModifiers {
  if (partnerSpecs.length === 0) return base;

  let {
    troopRegenPercent,
    maxTroopsPercent,
    attackerLossPercent,
    defenderSlowPercent,
    stabilityTargetDelta,
    overexpansionStrainPercent,
    civilianTaxPercent,
    tradeIncomePercent,
    structureCostPercent,
    scienceRatePercent,
    samRangePercent,
  } = base;

  for (const { partnerPath, tradeType } of partnerSpecs) {
    if (tradeType === TradeAgreementType.CommercePact) {
      tradeIncomePercent += 15;
    }

    if (
      myPath === DevelopmentPath.Military &&
      partnerPath === DevelopmentPath.Scientific
    ) {
      // Military trading with Scientific -> gains R&D & air-defense edge
      scienceRatePercent += 20;
      samRangePercent += 15;
    } else if (
      myPath === DevelopmentPath.Scientific &&
      partnerPath === DevelopmentPath.Military
    ) {
      // Scientific trading with Military -> gains troop logistics & combat training
      troopRegenPercent += 12;
      attackerLossPercent -= 8;
    } else if (
      myPath === DevelopmentPath.Political &&
      partnerPath === DevelopmentPath.Military
    ) {
      // Political trading with Military -> gains border security & army reserve cap
      defenderSlowPercent -= 15;
      maxTroopsPercent += 10;
    } else if (
      myPath === DevelopmentPath.Military &&
      partnerPath === DevelopmentPath.Political
    ) {
      // Military trading with Political -> gains stability & administrative relief
      stabilityTargetDelta += 8;
      overexpansionStrainPercent -= 20;
    } else if (
      myPath === DevelopmentPath.Political &&
      partnerPath === DevelopmentPath.Scientific
    ) {
      // Political trading with Scientific -> gains research & infrastructure efficiency
      scienceRatePercent += 20;
      structureCostPercent -= 6;
    } else if (
      myPath === DevelopmentPath.Scientific &&
      partnerPath === DevelopmentPath.Political
    ) {
      // Scientific trading with Political -> gains governance stability & tax administration
      stabilityTargetDelta += 6;
      civilianTaxPercent += 15;
      overexpansionStrainPercent -= 15;
    } else {
      // Same-path or unpledged partner -> modest mutual economic & diplomatic boost
      tradeIncomePercent += 10;
      stabilityTargetDelta += 3;
    }
  }

  return {
    ...base,
    troopRegenPercent,
    maxTroopsPercent,
    attackerLossPercent: Math.max(40, attackerLossPercent),
    defenderSlowPercent: Math.max(40, defenderSlowPercent),
    stabilityTargetDelta,
    overexpansionStrainPercent: Math.max(20, overexpansionStrainPercent),
    civilianTaxPercent,
    tradeIncomePercent,
    structureCostPercent: Math.max(45, structureCostPercent),
    scienceRatePercent,
    samRangePercent,
  };
}
