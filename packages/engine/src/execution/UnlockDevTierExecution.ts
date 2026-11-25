import {
  DevelopmentPath,
  MessageType,
} from "@openfront/engine-api/game/GameTypes";
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
  private mg: Game;

  constructor(
    private player: Player,
    private path: DevelopmentPath,
  ) {}

  init(mg: Game, _ticks: number): void {
    this.mg = mg;
  }

  tick(_ticks: number): void {
    if (this.player.isAlive()) {
      const ok = this.player.unlockDevTier(this.path);
      if (ok && this.mg) {
        this.mg.displayMessage(
          "crownfall.paths_unlocked_toast",
          MessageType.ALLIANCE_ACCEPTED,
          this.player.id(),
          undefined,
          {
            path: this.path.charAt(0).toUpperCase() + this.path.slice(1),
            tier: this.player.devLevel(this.path),
          },
        );
      }
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
    this.mg = r.game;
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
