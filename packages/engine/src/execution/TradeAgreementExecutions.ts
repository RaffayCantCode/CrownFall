import {
  PlayerID,
  TradeAgreementType,
} from "@openfront/engine-api/game/GameTypes";
import { zInt, zPlayerRef } from "@openfront/engine-lib/snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Player } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";

export class TradeRequestExecution implements Execution {
  private active = true;
  private mg: Game;

  constructor(
    private proposer: Player,
    private recipientID: PlayerID,
    private tradeType: TradeAgreementType,
  ) {}

  init(mg: Game, _ticks: number): void {
    this.mg = mg;
  }

  tick(_ticks: number): void {
    if (this.proposer.isAlive() && this.mg.hasPlayer(this.recipientID)) {
      const recipient = this.mg.player(this.recipientID);
      this.mg.createTradeRequest(this.proposer, recipient, this.tradeType);
    }
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return TradeRequestExecutionSnapshot.write({
      active: this.active,
      initialized: this.mg !== undefined,
      proposer: w.player(this.proposer),
      recipientID: this.recipientID,
      tradeType: this.tradeType,
    });
  }

  restoreSnapshot(
    s: z.infer<typeof TradeRequestStateSchema>,
    r: SnapshotReader,
  ): void {
    this.active = s.active;
    if (s.initialized) this.mg = r.game;
    this.proposer = r.player(s.proposer);
    this.recipientID = s.recipientID;
    this.tradeType = s.tradeType;
  }
}

const TradeRequestStateSchema = z.object({
  active: z.boolean(),
  initialized: z.boolean(),
  proposer: zPlayerRef(),
  recipientID: z.string(),
  tradeType: z.enum(TradeAgreementType),
});

export const TradeRequestExecutionSnapshot = execSnapshotType({
  name: "TradeRequest",
  version: 1,
  schema: TradeRequestStateSchema,
  cls: () => TradeRequestExecution,
});

export class TradeReplyExecution implements Execution {
  private active = true;
  private mg: Game;

  constructor(
    private recipient: Player,
    private requestID: number,
    private accept: boolean,
  ) {}

  init(mg: Game, _ticks: number): void {
    this.mg = mg;
  }

  tick(_ticks: number): void {
    if (this.recipient.isAlive()) {
      this.mg.replyTradeRequest(this.recipient, this.requestID, this.accept);
    }
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return TradeReplyExecutionSnapshot.write({
      active: this.active,
      initialized: this.mg !== undefined,
      recipient: w.player(this.recipient),
      requestID: this.requestID,
      accept: this.accept,
    });
  }

  restoreSnapshot(
    s: z.infer<typeof TradeReplyStateSchema>,
    r: SnapshotReader,
  ): void {
    this.active = s.active;
    if (s.initialized) this.mg = r.game;
    this.recipient = r.player(s.recipient);
    this.requestID = s.requestID;
    this.accept = s.accept;
  }
}

const TradeReplyStateSchema = z.object({
  active: z.boolean(),
  initialized: z.boolean(),
  recipient: zPlayerRef(),
  requestID: zInt(),
  accept: z.boolean(),
});

export const TradeReplyExecutionSnapshot = execSnapshotType({
  name: "TradeReply",
  version: 1,
  schema: TradeReplyStateSchema,
  cls: () => TradeReplyExecution,
});

export class TradeCancelExecution implements Execution {
  private active = true;
  private mg: Game;

  constructor(
    private actor: Player,
    private agreementID: number,
  ) {}

  init(mg: Game, _ticks: number): void {
    this.mg = mg;
  }

  tick(_ticks: number): void {
    if (this.actor.isAlive()) {
      this.mg.cancelTradeAgreement(this.actor, this.agreementID);
    }
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return TradeCancelExecutionSnapshot.write({
      active: this.active,
      initialized: this.mg !== undefined,
      actor: w.player(this.actor),
      agreementID: this.agreementID,
    });
  }

  restoreSnapshot(
    s: z.infer<typeof TradeCancelStateSchema>,
    r: SnapshotReader,
  ): void {
    this.active = s.active;
    if (s.initialized) this.mg = r.game;
    this.actor = r.player(s.actor);
    this.agreementID = s.agreementID;
  }
}

const TradeCancelStateSchema = z.object({
  active: z.boolean(),
  initialized: z.boolean(),
  actor: zPlayerRef(),
  agreementID: zInt(),
});

export const TradeCancelExecutionSnapshot = execSnapshotType({
  name: "TradeCancel",
  version: 1,
  schema: TradeCancelStateSchema,
  cls: () => TradeCancelExecution,
});
