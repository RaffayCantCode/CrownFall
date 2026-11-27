import {
  BountyRewardType,
  Gold,
  PlayerType,
} from "@openfront/engine-api/game/GameTypes";
import { PseudoRandom } from "../PseudoRandom";
import { type CrownfallPathModifiers } from "./CrownfallPaths";

export const CROWNFALL_BOUNTY_CONFIG = {
  /** Earliest active-gameplay tick before the first bounty can trigger (4 minutes = 2400 ticks). */
  firstBountyDelayTicks: 2_400,
  /** Duration an active bounty lasts before expiring (2m 30s = 1500 ticks). */
  bountyDurationTicks: 1_500,
  /** Cooldown after a bounty ends or is claimed before the next bounty triggers (3m = 1800 ticks). */
  bountyCooldownTicks: 1_800,
  /** Duration of temporary Military / Economic bounty buffs (45s = 450 ticks). */
  temporaryBuffDurationTicks: 450,
  /** Minimum tiles an active Human or AI Nation must own to be selected as a bounty target. */
  minEligibleTargetTiles: 25,
} as const;

export interface BountyRewardGrant {
  rewardType: BountyRewardType;
  gold: Gold;
  troops: number;
  civilians: number;
  food: number;
  science: number;
  buffDurationTicks: number;
}

/**
 * Rolls one random reward from the eligible pool and scales its magnitude
 * sensibly by match progression, claimant territory share (anti-snowball),
 * and prior claims by the same country (anti-farming).
 */
export function rollScaledBountyReward(
  rng: PseudoRandom,
  activeGameplayTicks: number,
  claimantTiles: number,
  totalLandTiles: number,
  maxTroopsCap: number,
  priorClaimsByWinner: number,
  foodEnabled: boolean,
): BountyRewardGrant {
  const pool: BountyRewardType[] = [
    BountyRewardType.GoldJackpot,
    BountyRewardType.TroopReinforcement,
    BountyRewardType.CivilianBoom,
    BountyRewardType.ScienceBoost,
    BountyRewardType.MilitaryEfficiency,
    BountyRewardType.EconomicAdvantage,
  ];
  if (foodEnabled) {
    pool.push(BountyRewardType.FoodReserves);
  }

  const rewardType = pool[rng.nextInt(0, pool.length)];

  // Match progression factor (100% at 4m, up to 180% in late game >= 20m)
  const minutes = Math.max(4, Math.floor(activeGameplayTicks / 600));
  const timeScalePct = Math.min(180, 80 + minutes * 5);

  // Anti-snowball size factor: smaller countries (<10% land) get 125%,
  // mid-size (10..25%) get 100%, dominant superpowers (>25% land) get 55%.
  const landRatioPct =
    totalLandTiles > 0 ? Math.floor((claimantTiles * 100) / totalLandTiles) : 5;
  const sizeScalePct =
    landRatioPct < 10 ? 125 : landRatioPct <= 25 ? 100 : 55;

  // Anti-repeat-snowball decay: 100%, 70%, 50%, 35%...
  const repeatScalePct =
    priorClaimsByWinner <= 0
      ? 100
      : priorClaimsByWinner === 1
        ? 70
        : priorClaimsByWinner === 2
          ? 50
          : 35;

  const combinedPct = Math.max(
    25,
    Math.floor((timeScalePct * sizeScalePct * repeatScalePct) / 10_000),
  );

  const grant: BountyRewardGrant = {
    rewardType,
    gold: 0n,
    troops: 0,
    civilians: 0,
    food: 0,
    science: 0,
    buffDurationTicks: 0,
  };

  switch (rewardType) {
    case BountyRewardType.GoldJackpot:
      grant.gold = BigInt(Math.max(75_000, Math.floor((220_000 * combinedPct) / 100)));
      break;
    case BountyRewardType.TroopReinforcement: {
      const rawTroops = Math.floor((maxTroopsCap * 22 * combinedPct) / 10_000);
      grant.troops = Math.max(8_000, Math.min(180_000, rawTroops));
      break;
    }
    case BountyRewardType.CivilianBoom:
      grant.civilians = Math.max(15_000, Math.floor((45_000 * combinedPct) / 100));
      break;
    case BountyRewardType.FoodReserves:
      grant.food = Math.max(1_000, Math.floor((2_800 * combinedPct) / 100));
      break;
    case BountyRewardType.ScienceBoost:
      grant.science = Math.max(150, Math.floor((420 * combinedPct) / 100));
      break;
    case BountyRewardType.MilitaryEfficiency:
    case BountyRewardType.EconomicAdvantage:
      grant.buffDurationTicks = CROWNFALL_BOUNTY_CONFIG.temporaryBuffDurationTicks;
      break;
  }

  return grant;
}

export function applyBountyBuffModifiers(
  base: CrownfallPathModifiers,
  activeBountyBuff: BountyRewardType | null,
): CrownfallPathModifiers {
  if (activeBountyBuff === BountyRewardType.MilitaryEfficiency) {
    return {
      ...base,
      attackSpeedPercent: base.attackSpeedPercent + 25,
      attackerLossPercent: Math.max(35, base.attackerLossPercent - 20),
      troopRegenPercent: base.troopRegenPercent + 20,
    };
  }
  if (activeBountyBuff === BountyRewardType.EconomicAdvantage) {
    return {
      ...base,
      civilianTaxPercent: base.civilianTaxPercent + 45,
      tradeIncomePercent: base.tradeIncomePercent + 40,
      structureCostPercent: Math.max(40, base.structureCostPercent - 20),
    };
  }
  return base;
}

export function isEligibleBountyTargetType(type: PlayerType): boolean {
  return type === PlayerType.Human || type === PlayerType.Nation;
}
