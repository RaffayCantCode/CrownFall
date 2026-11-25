import { DevelopmentPath } from "@openfront/engine-api/game/GameTypes";
import { zPlayerRef } from "@openfront/engine-lib/snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Player } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";

export class UnlockDevTierExecution implements Execution {
  private active = true;

  constructor(
    private player: Player,
    private path: DevelopmentPath,
  ) {}

  init(_mg: Game, _ticks: number): void {}

  tick(_ticks: number): void {
    if (this.player.isAlive()) {
      this.player.unlockDevTier(this.path);
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
    return UnlockDevTierExecutionSnapshot.write({
      active: this.active,
      player: w.player(this.player),
      path: this.path,
    });
  }

  restoreSnapshot(s: UnlockDevTierState, r: SnapshotReader): void {
    this.active = s.active;
    this.player = r.player(s.player);
    this.path = s.path;
  }
}

const UnlockDevTierStateSchema = z.object({
  active: z.boolean(),
  player: zPlayerRef(),
  path: z.enum(DevelopmentPath),
});
type UnlockDevTierState = z.infer<typeof UnlockDevTierStateSchema>;

export const UnlockDevTierExecutionSnapshot = execSnapshotType({
  name: "UnlockDevTier",
  version: 1,
  schema: UnlockDevTierStateSchema,
  cls: () => UnlockDevTierExecution,
});
