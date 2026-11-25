/**
 * Crownfall Meaningful Alliances tunables & anti-exploit caps.
 */
export const CROWNFALL_ALLIANCE_CONFIG = {
  /** Requests expire if unanswered after 20 seconds (200 ticks). */
  requestExpirationTicks: 200,
  /** Cooldown between requests from the same requestor to the same ally (45s). */
  requestCooldownTicks: 450,
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
} as const;
