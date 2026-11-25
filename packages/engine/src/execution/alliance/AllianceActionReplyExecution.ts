import { zInt, zPlayerRef } from "@openfront/engine-lib/snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Player } from "../../game/Game";
import { execSnapshotType } from "../../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../../snapshot/SnapshotContext";

export class AllianceActionReplyExecution implements Execution {
  private active = true;
  private mg: Game;

  constructor(
    private responder: Player,
    private requestID: number,
    private accept: boolean,
  ) {}

  init(mg: Game, _ticks: number): void {
    this.mg = mg;
  }

  tick(_ticks: number): void {
    if (this.responder.isAlive()) {
      this.mg.replyAllianceActionRequest(
        this.responder,
        this.requestID,
        this.accept,
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
    return AllianceActionReplyExecutionSnapshot.write({
      active: this.active,
      initialized: this.mg !== undefined,
      responder: w.player(this.responder),
      requestID: this.requestID,
      accept: this.accept,
    });
  }

  restoreSnapshot(s: AllianceActionReplyState, r: SnapshotReader): void {
    this.active = s.active;
    if (s.initialized) this.mg = r.game;
    this.responder = r.player(s.responder);
    this.requestID = s.requestID;
    this.accept = s.accept;
  }
}

const AllianceActionReplyStateSchema = z.object({
  active: z.boolean(),
  initialized: z.boolean(),
  responder: zPlayerRef(),
  requestID: zInt(),
  accept: z.boolean(),
});
type AllianceActionReplyState = z.infer<typeof AllianceActionReplyStateSchema>;

export const AllianceActionReplyExecutionSnapshot = execSnapshotType({
  name: "AllianceActionReply",
  version: 1,
  schema: AllianceActionReplyStateSchema,
  cls: () => AllianceActionReplyExecution,
});
