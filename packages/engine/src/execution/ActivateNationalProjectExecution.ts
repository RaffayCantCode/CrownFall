import {
  MessageType,
  NationalProject,
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

export class ActivateNationalProjectExecution implements Execution {
  private active = true;
  private mg: Game;

  constructor(
    private player: Player,
    private project: NationalProject,
  ) {}

  init(mg: Game, _ticks: number): void {
    this.mg = mg;
  }

  tick(_ticks: number): void {
    if (this.player.isAlive()) {
      const ok = this.player.activateNationalProject(this.project);
      if (ok) {
        this.mg.displayMessage(
          `crownfall.project.${this.project}.activated`,
          MessageType.ALLIANCE_ACCEPTED,
          this.player.id(),
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
    return ActivateNationalProjectExecutionSnapshot.write({
      active: this.active,
      player: w.player(this.player),
      project: this.project,
    });
  }

  restoreSnapshot(s: ActivateNationalProjectState, r: SnapshotReader): void {
    this.active = s.active;
    this.mg = r.game;
    this.player = r.player(s.player);
    this.project = s.project;
  }
}

const ActivateNationalProjectStateSchema = z.object({
  active: z.boolean(),
  player: zPlayerRef(),
  project: z.enum(NationalProject),
});
type ActivateNationalProjectState = z.infer<
  typeof ActivateNationalProjectStateSchema
>;

export const ActivateNationalProjectExecutionSnapshot = execSnapshotType({
  name: "ActivateNationalProject",
  version: 1,
  schema: ActivateNationalProjectStateSchema,
  cls: () => ActivateNationalProjectExecution,
});
