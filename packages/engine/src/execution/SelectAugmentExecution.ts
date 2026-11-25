import { AugmentId } from "@openfront/engine-api/game/GameTypes";
import { zPlayerRef } from "@openfront/engine-lib/snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Player } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";

export class SelectAugmentExecution implements Execution {
  private active = true;

  constructor(
    private player: Player,
    private augmentId: AugmentId,
  ) {}

  init(_mg: Game, _ticks: number): void {}

  tick(_ticks: number): void {
    if (this.player.isAlive()) {
      this.player.selectAugment(this.augmentId);
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
    return SelectAugmentExecutionSnapshot.write({
      active: this.active,
      player: w.player(this.player),
      augmentId: this.augmentId,
    });
  }

  restoreSnapshot(s: SelectAugmentState, r: SnapshotReader): void {
    this.active = s.active;
    this.player = r.player(s.player);
    this.augmentId = s.augmentId;
  }
}

const SelectAugmentStateSchema = z.object({
  active: z.boolean(),
  player: zPlayerRef(),
  augmentId: z.enum(AugmentId),
});
type SelectAugmentState = z.infer<typeof SelectAugmentStateSchema>;

export const SelectAugmentExecutionSnapshot = execSnapshotType({
  name: "SelectAugment",
  version: 1,
  schema: SelectAugmentStateSchema,
  cls: () => SelectAugmentExecution,
});
