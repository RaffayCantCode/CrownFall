import {
  DevelopmentPath,
  GameType,
  NationalProject,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { IntentSchema } from "@openfront/engine-api/Schemas";
import { NATIONAL_PROJECTS_BY_ID } from "@openfront/engine-lib/configuration/CrownfallProjects";
import { ActivateNationalProjectExecution } from "@openfront/engine/execution/ActivateNationalProjectExecution";
import { NukeExecution } from "@openfront/engine/execution/NukeExecution";
import { SpawnExecution } from "@openfront/engine/execution/SpawnExecution";
import { Game } from "@openfront/engine/game/Game";
import { describe, expect, test } from "vitest";
import { setup } from "../util/Setup";
import { expectSnapshotRoundTrip } from "../util/Snapshot";
import { executeTicks } from "../util/utils";

async function createPhase6Game(): Promise<Game> {
  const p1Info = new PlayerInfo("MilSuperpower", PlayerType.Human, "c1", "p1");
  const p2Info = new PlayerInfo("SciSuperpower", PlayerType.Human, "c2", "p2");
  const game = await setup(
    "plains",
    {
      gameType: GameType.Private,
      infiniteGold: false,
      infiniteTroops: false,
      instantBuild: true,
      startingGold: 500_000,
    },
    [p1Info, p2Info],
  );
  game.addExecution(
    new SpawnExecution("test-game", p1Info, game.ref(8, 8)),
    new SpawnExecution("test-game", p2Info, game.ref(35, 35)),
  );
  executeTicks(game, 3);
  game.endSpawnPhase();
  executeTicks(game, 3);
  return game;
}

describe("Crownfall Phase 6: Advanced Technologies & National Operations", () => {
  test("late-tier Military & Scientific unlocks modify missile speed, silo cooldown, blast radius, and EW jamming", async () => {
    const game = await createPhase6Game();
    const p1 = game.player("p1");
    const p2 = game.player("p2");

    // Paint p2 territory at (35,35)
    for (let x = 32; x < 39; x++) {
      for (let y = 32; y < 39; y++) {
        p2.conquer(game.ref(x, y));
      }
    }

    p1.setPrimaryPath(DevelopmentPath.Military);
    p1.addScience(5_000);
    for (let i = 0; i < 4; i++) {
      expect(p1.unlockDevTier(DevelopmentPath.Military)).toBe(true);
    }

    p2.setPrimaryPath(DevelopmentPath.Scientific);
    p2.addScience(5_000);
    for (let i = 0; i < 4; i++) {
      expect(p2.unlockDevTier(DevelopmentPath.Scientific)).toBe(true);
    }

    const milMods = p1.pathModifiers();
    expect(milMods.siloCooldownPercent).toBe(75); // -25% silo reload
    expect(milMods.nukeSpeedPercent).toBe(128); // +28% missile speed

    const sciMods = p2.pathModifiers();
    expect(sciMods.nukeBlastRadiusPercent).toBe(122); // +22% precision blast radius
    expect(sciMods.incomingNukeSlowPercent).toBe(70); // -30% enemy missile speed via EW

    // Verify NukeExecution speed calculation against neutral land vs EW-protected Scientific target
    const baseSpeed = game.config().nukeSpeed(UnitType.AtomBomb);
    const nukeNeutral = new NukeExecution(
      UnitType.AtomBomb,
      p1,
      game.ref(20, 20),
      game.ref(8, 8),
    );
    nukeNeutral.init(game, game.ticks());

    const nukeVsEW = new NukeExecution(
      UnitType.AtomBomb,
      p1,
      game.ref(35, 35),
      game.ref(8, 8),
    );
    nukeVsEW.init(game, game.ticks());

    // Against neutral land: baseSpeed * 128%; against Scientific T4 EW: (baseSpeed * 128%) * 70%
    const fastSpeed = Math.floor((baseSpeed * milMods.nukeSpeedPercent) / 100);
    const jammedSpeed = Math.floor(
      (fastSpeed * sciMods.incomingNukeSlowPercent) / 100,
    );
    expect((nukeNeutral as unknown as { speed: number }).speed).toBe(fastSpeed);
    expect((nukeVsEW as unknown as { speed: number }).speed).toBe(jammedSpeed);
  });

  test("National Operations require Tier 2, spend Science & Gold, apply effects, expire after 20s, and enforce 90s cooldown", async () => {
    const game = await createPhase6Game();
    const p1 = game.player("p1");

    p1.setPrimaryPath(DevelopmentPath.Military);
    p1.addScience(2_000);
    p1.addGold(500_000n);

    // Locked at Tier 0 and Tier 1
    expect(p1.activateNationalProject(NationalProject.SurgeMobilisation)).toBe(
      false,
    );
    p1.unlockDevTier(DevelopmentPath.Military); // Tier 1
    expect(p1.activateNationalProject(NationalProject.SurgeMobilisation)).toBe(
      false,
    );

    p1.unlockDevTier(DevelopmentPath.Military); // Tier 2 unlocks SurgeMobilisation!
    p1.setTroops(1_000);
    const stabBefore = p1.stability();
    const sciBefore = p1.science();
    const goldBefore = p1.gold();

    game.addExecution(
      new ActivateNationalProjectExecution(
        p1,
        NationalProject.SurgeMobilisation,
      ),
    );
    executeTicks(game, 2);

    const def = NATIONAL_PROJECTS_BY_ID[NationalProject.SurgeMobilisation];
    expect(p1.activeProject()).toBe(NationalProject.SurgeMobilisation);
    expect(p1.science()).toBe(sciBefore - def.scienceCost);
    expect(p1.gold() < goldBefore).toBe(true);
    expect(p1.troops()).toBeGreaterThan(1_500);
    expect(p1.stability()).toBeLessThanOrEqual(stabBefore - 7);
    expect(p1.pathModifiers().attackSpeedPercent).toBeGreaterThanOrEqual(130);

    // Cannot activate another project while active or on cooldown
    expect(p1.activateNationalProject(NationalProject.SurgeMobilisation)).toBe(
      false,
    );

    // Advance past 200-tick duration: active project expires, cooldown still blocks
    executeTicks(game, def.durationTicks + 5);
    expect(p1.activeProject()).toBeNull();
    expect(p1.activateNationalProject(NationalProject.SurgeMobilisation)).toBe(
      false,
    );

    // Advance past 900-tick cooldown: can activate again!
    executeTicks(game, def.cooldownTicks);
    expect(p1.activateNationalProject(NationalProject.SurgeMobilisation)).toBe(
      true,
    );
  });

  test("NationalReconciliation restores stability and purges rebellion risk; EmpOverdrive boosts SAM and jams borders", async () => {
    const game = await createPhase6Game();
    const p1 = game.player("p1");
    const p2 = game.player("p2");

    // Political Tier 2 -> National Reconciliation
    p1.setPrimaryPath(DevelopmentPath.Political);
    p1.addScience(2_000);
    p1.unlockDevTier(DevelopmentPath.Political);
    p1.unlockDevTier(DevelopmentPath.Political);
    p1.setStability(30);
    p1.setRebellionMeter(70);

    expect(
      p1.activateNationalProject(NationalProject.NationalReconciliation),
    ).toBe(true);
    expect(p1.stability()).toBe(45);
    expect(p1.rebellionMeter()).toBe(30);
    expect(p1.pathModifiers().civilianTaxPercent).toBeGreaterThanOrEqual(140);

    // Scientific Tier 2 -> EMP Overdrive
    p2.setPrimaryPath(DevelopmentPath.Scientific);
    p2.addScience(2_000);
    p2.unlockDevTier(DevelopmentPath.Scientific);
    p2.unlockDevTier(DevelopmentPath.Scientific);

    expect(p2.activateNationalProject(NationalProject.EmpOverdrive)).toBe(true);
    const empMods = p2.pathModifiers();
    expect(empMods.samRangePercent).toBeGreaterThanOrEqual(160);
    expect(empMods.samCooldownPercent).toBeLessThanOrEqual(40);
    expect(empMods.incomingNukeSlowPercent).toBe(75);
  });

  test("activate_national_project intent parses via IntentSchema and PlayerSnapshot v6 round-trips byte-identically", async () => {
    expect(
      IntentSchema.parse({
        type: "activate_national_project",
        project: NationalProject.EmpOverdrive,
      }),
    ).toEqual({
      type: "activate_national_project",
      project: NationalProject.EmpOverdrive,
    });

    const game = await createPhase6Game();
    const p1 = game.player("p1");
    p1.setPrimaryPath(DevelopmentPath.Military);
    p1.addScience(2_000);
    p1.unlockDevTier(DevelopmentPath.Military);
    p1.unlockDevTier(DevelopmentPath.Military);
    expect(p1.activateNationalProject(NationalProject.SurgeMobilisation)).toBe(
      true,
    );

    const restored = await expectSnapshotRoundTrip(game, "plains");
    const rp1 = restored.player("p1");
    expect(rp1.activeProject()).toBe(p1.activeProject());
    expect(rp1.projectCooldownUntilTick()).toBe(p1.projectCooldownUntilTick());
  });
});
