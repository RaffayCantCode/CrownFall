import { TaxRate } from "@openfront/engine-api/game/GameTypes";
import { zPlayerRef } from "@openfront/engine-lib/snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Player } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";

export class SetTaxRateExecution implements Execution {
  private active = true;

  constructor(
    private player: Player,
    private taxRate: TaxRate,
  ) {}

  init(_mg: Game, _ticks: number): void {}

  tick(_ticks: number): void {
    if (this.player.isAlive()) {
      this.player.setTaxRate(this.taxRate);
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
    return SetTaxRateExecutionSnapshot.write({
      active: this.active,
      player: w.player(this.player),
      taxRate: this.taxRate,
    });
  }

  restoreSnapshot(s: SetTaxRateState, r: SnapshotReader): void {
    this.active = s.active;
    this.player = r.player(s.player);
    this.taxRate = s.taxRate;
  }
}

const SetTaxRateStateSchema = z.object({
  active: z.boolean(),
  player: zPlayerRef(),
  taxRate: z.enum(TaxRate),
});
type SetTaxRateState = z.infer<typeof SetTaxRateStateSchema>;

export const SetTaxRateExecutionSnapshot = execSnapshotType({
  name: "SetTaxRate",
  version: 1,
  schema: SetTaxRateStateSchema,
  cls: () => SetTaxRateExecution,
});
