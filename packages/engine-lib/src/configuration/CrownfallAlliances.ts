/**
 * Crownfall Meaningful Alliances tunables & anti-exploit caps.
 */
export const CROWNFALL_ALLIANCE_CONFIG = {
  /** Requests expire if unanswered after 20 seconds (200 ticks). */
  requestExpirationTicks: 200,
  /** Cooldown between requests from the same requestor to the same ally (20s). */
  requestCooldownTicks: 200,
  /** Share (%) of ally's troops committed to a Joint Attack on accept. */
  jointAttackTroopPercent: 25,
  /** Share (%) of ally's troops sent as Reinforcements on accept. */
  reinforcementTroopPercent: 20,
  /** Hard cap on troops transferred in a single Reinforcement/Defense Aid response. */
  maxReinforcementTroops: 250_000,
  /** Share (%) of ally's troops sent as Defense Aid on accept. */
  defenseAidTroopPercent: 15,
  /** Share (%) of ally's troops committed to counter-attacking the invader in Defense Aid. */
  defenseAidCounterAttackPercent: 15,
  /** Standard Gold payment offered by requestor when buying allied troops (TroopsForGold). */
  troopsForGoldStandardPayment: 100_000n,
  /** Minimum Gold required to propose a TroopsForGold deal. */
  troopsForGoldMinPayment: 50_000n,
  /** Share (%) of ally's troops transferred in a TroopsForGold purchase. */
  troopsForGoldTroopPercent: 25,
  /** Share (%) of requestor's troops offered when selling mercenaries for Gold (GoldForTroops). */
  goldForTroopsSendPercent: 20,
  /** Minimum troops required to propose a GoldForTroops deal. */
  goldForTroopsMinTroops: 2_000,
  /** Standard Gold payout from ally in a GoldForTroops deal. */
  goldForTroopsStandardPayout: 100_000n,
  /** Minimum Gold ally must pay in a GoldForTroops deal. */
  goldForTroopsMinPayout: 50_000n,
  /** Share (%) of ally's treasury sent as GoldAid on accept. */
  goldAidPercent: 20,
  /** Hard cap on Gold transferred in a single GoldAid response. */
  maxGoldAid: 300_000n,
  /** Minimum Gold transferred in GoldAid. */
  minGoldAid: 10_000n,
} as const;
