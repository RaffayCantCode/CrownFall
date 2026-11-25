import {
  AllianceActionType,
  PlayerID,
} from "@openfront/engine-api/game/GameTypes";
import { zPlayerRef } from "@openfront/engine-lib/snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Player } from "../../game/Game";
import { execSnapshotType } from "../../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../../snapshot/SnapshotContext";

export class AllianceActionRequestExecution implements Execution {
  private active = true;
  private mg: Game;

  constructor(
    private requestor: Player,
    private recipientID: PlayerID,
    private actionType: AllianceActionType,
    private targetID: PlayerID | null,
  ) {}

  init(mg: Game, _ticks: number): void {
    this.mg = mg;
  }

  tick(_ticks: number): void {
    if (
      this.requestor.isAlive() &&
      this.mg.hasPlayer(this.recipientID)
    ) {
      const recipient = this.mg.player(this.recipientID);
      const target =
        this.targetID !== null && this.mg.hasPlayer(this.targetID)
          ? this.mg.player(this.targetID)
          : null;
      this.mg.createAllianceActionRequest(
        this.requestor,
        recipient,
        this.actionType,
        target,
      );
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
    return AllianceActionRequestExecutionSnapshot.write({
      active: this.active,
      initialized: this.mg !== undefined,
      requestor: w.player(this.requestor),
      recipientID: this.recipientID,
      actionType: this.actionType,
      targetID: this.targetID,
    });
  }

  restoreSnapshot(s: AllianceActionRequestState, r: SnapshotReader): void {
    this.active = s.active;
    if (s.initialized) this.mg = r.game;
    this.requestor = r.player(s.requestor);
    this.recipientID = s.recipientID;
    this.actionType = s.actionType;
    this.targetID = s.targetID;
  }
}

const AllianceActionRequestStateSchema = z.object({
  active: z.boolean(),
  initialized: z.boolean(),
  requestor: zPlayerRef(),
  recipientID: z.string(),
  actionType: z.enum(AllianceActionType),
  targetID: z.string().nullable(),
});
type AllianceActionRequestState = z.infer<
  typeof AllianceActionRequestStateSchema
>;

export const AllianceActionRequestExecutionSnapshot = execSnapshotType({
  name: "AllianceActionRequest",
  version: 1,
  schema: AllianceActionRequestStateSchema,
  cls: () => AllianceActionRequestExecution,
});
