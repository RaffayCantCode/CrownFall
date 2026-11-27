import {
  DevelopmentPath,
  PlayerInfo,
  PlayerType,
  TradeAgreementType,
} from "@openfront/engine-api/game/GameTypes";
import { IntentSchema } from "@openfront/engine-api/Schemas";
import { AttackExecution } from "@openfront/engine/execution/AttackExecution";
import { SpawnExecution } from "@openfront/engine/execution/SpawnExecution";
import {
  TradeCancelExecution,
  TradeReplyExecution,
  TradeRequestExecution,
} from "@openfront/engine/execution/TradeAgreementExecutions";
import { Game } from "@openfront/engine/game/Game";
import { describe, expect, test } from "vitest";
import { setup } from "../util/Setup";
import { expectSnapshotRoundTrip } from "../util/Snapshot";
import { executeTicks } from "../util/utils";

async function createTradeGame(disableTrade = false): Promise<Game> {
  const p1Info = new PlayerInfo("MilEmpire", PlayerType.Human, "c1", "p1");
  const p2Info = new PlayerInfo("SciRepublic", PlayerType.Human, "c2", "p2");
  const p3Info = new PlayerInfo("PolKingdom", PlayerType.Human, "c3", "p3");
  const game = await setup(
    "plains",
    {
      instantBuild: true,
      startingGold: 1_000_000,
      ...(disableTrade ? { disableTrade: true } : {}),
    },
    [p1Info, p2Info, p3Info],
    undefined,
    undefined,
    false,
  );
  game.addExecution(new SpawnExecution("test-trade", p1Info, game.ref(12, 12)));
  game.addExecution(new SpawnExecution("test-trade", p2Info, game.ref(20, 12)));
  game.addExecution(new SpawnExecution("test-trade", p3Info, game.ref(42, 42)));
  executeTicks(game, 105);

  // Give p1 and p2 a shared border so they are neighbouring nations even without an alliance!
  const p1 = game.player("p1");
  const p2 = game.player("p2");
  for (let x = 10; x <= 16; x++) {
    for (let y = 10; y <= 16; y++) p1.conquer(game.ref(x, y));
  }
  for (let x = 17; x <= 23; x++) {
    for (let y = 10; y <= 16; y++) p2.conquer(game.ref(x, y));
  }
  return game;
}

describe("Crownfall Expansion Phase 3: International Trade Agreements", () => {
  test("neighbouring countries can sign ImportFood trade, exchange Food for Gold, and gain bidirectional Path Synergies", async () => {
    const game = await createTradeGame(false);
    const p1 = game.player("p1");
    const p2 = game.player("p2");
    const p3 = game.player("p3");

    // Non-bordering, non-allied p3 cannot trade with p1
    expect(
      game.createTradeRequest(p1, p3, TradeAgreementType.CommercePact),
    ).toBeNull();

    p1.setPrimaryPath(DevelopmentPath.Military);
    p2.setPrimaryPath(DevelopmentPath.Scientific);
    p2.setFood(3_000);
    p1.setFood(1_000);

    const baseMilSciRate = p1.pathModifiers().scienceRatePercent;
    const baseSciRegen = p2.pathModifiers().troopRegenPercent;

    // Propose & accept ImportFood between bordering p1 and p2
    game.addExecution(
      new TradeRequestExecution(p1, p2.id(), TradeAgreementType.ImportFood),
    );
    executeTicks(game, 2);
    const pending = game.pendingTradeRequestsFor(p2);
    expect(pending.length).toBe(1);

    game.addExecution(new TradeReplyExecution(p2, pending[0].id, true));
    executeTicks(game, 2);
    expect(game.tradeAgreementsFor(p1).length).toBe(1);
    expect(p1.netTradeFoodPerSec()).toBeGreaterThan(0);
    expect(p2.netTradeFoodPerSec()).toBeLessThan(0);

    // Bidirectional Military <-> Scientific trade synergies active immediately!
    expect(p1.pathModifiers().scienceRatePercent).toBeGreaterThan(baseMilSciRate);
    expect(p1.pathModifiers().samRangePercent).toBeGreaterThan(100);
    expect(p2.pathModifiers().troopRegenPercent).toBeGreaterThan(baseSciRegen);
    expect(p2.pathModifiers().attackerLossPercent).toBeLessThan(100);

    // Advance 20 ticks (2 seconds) so automatic food-for-gold shipments run
    const p2GoldBefore = p2.gold();
    executeTicks(game, 20);
    expect(p2.gold()).toBeGreaterThan(p2GoldBefore);
  });

  test("entering direct warfare automatically cancels active trade agreements, and manual cancel respects min duration", async () => {
    const game = await createTradeGame(false);
    const p1 = game.player("p1");
    const p2 = game.player("p2");

    const reqId = game.createTradeRequest(
      p1,
      p2,
      TradeAgreementType.ResearchPact,
    )!;
    expect(reqId).not.toBeNull();
    expect(game.replyTradeRequest(p2, reqId, true)).toBe(true);

    // Cannot manually cancel before minAgreementDurationTicks (150)
    expect(game.cancelTradeAgreement(p1, reqId)).toBe(false);

    // Snapshot v5 round-trip preserves active trade agreements byte-identically
    await expectSnapshotRoundTrip(game, "plains", 10);

    // Direct attack immediately cancels trade agreement on next 1Hz tick!
    game.addExecution(new AttackExecution(5_000, p1, p2.id(), null));
    executeTicks(game, 15);
    expect(game.tradeAgreementsFor(p1).length).toBe(0);

    // Trade intents parse cleanly via IntentSchema
    expect(
      IntentSchema.parse({
        type: "trade_request",
        recipientID: "abcd1234",
        tradeType: TradeAgreementType.CommercePact,
      }),
    ).toEqual({
      type: "trade_request",
      recipientID: "abcd1234",
      tradeType: TradeAgreementType.CommercePact,
    });
    void TradeCancelExecution;
  });
});
