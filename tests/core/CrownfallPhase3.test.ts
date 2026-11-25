import {
  AugmentId,
  DevelopmentPath,
  GameType,
  PlayerInfo,
  PlayerType,
} from "@openfront/engine-api/game/GameTypes";
import { IntentSchema } from "@openfront/engine-api/Schemas";
import {
  AUGMENT_CHOICES_PER_ROUND,
  MAX_AUGMENTS_PER_PLAYER,
  MULTIPLAYER_DRAFT_TIMEOUT_TICKS,
} from "@openfront/engine-lib/configuration/CrownfallAugments";
import { SelectAugmentExecution } from "@openfront/engine/execution/SelectAugmentExecution";
import { SelectDevPathExecution } from "@openfront/engine/execution/SelectDevPathExecution";
import { SpawnExecution } from "@openfront/engine/execution/SpawnExecution";
import { Game } from "@openfront/engine/game/Game";
import { describe, expect, test } from "vitest";
import { setup } from "../util/Setup";
import { expectSnapshotRoundTrip } from "../util/Snapshot";
import { executeTicks } from "../util/utils";

async function createMultiplayerGame(
  gameType: GameType = GameType.Private,
): Promise<Game> {
  const p1 = new PlayerInfo("LeaderOne", PlayerType.Human, "c1", "p1");
  const p2 = new PlayerInfo("LeaderTwo", PlayerType.Human, "c2", "p2");
  const game = await setup(
    "plains",
    { gameType, instantBuild: true, startingGold: 1_000_000 },
    [p1, p2],
    undefined,
    undefined,
    false,
  );
  game.addExecution(new SpawnExecution("test-game", p1, game.ref(15, 15)));
  game.addExecution(new SpawnExecution("test-game", p2, game.ref(60, 60)));
  executeTicks(game, 5);
  game.endSpawnPhase();
  executeTicks(game, 5);
  return game;
}

describe("Crownfall Phase 3: Synchronized National Augment Drafts", () => {
  test("opening Path Draft pauses simulation for all players and resumes once all humans choose a path", async () => {
    const game = await createMultiplayerGame(GameType.Private);
    const p1 = game.player("p1");
    const p2 = game.player("p2");

    expect(game.isPathDraftActive()).toBe(false);
    expect(game.triggerPathDraft()).toBe(true);
    expect(game.isPathDraftActive()).toBe(true);

    const p1GoldBefore = p1.gold();
    executeTicks(game, 15);
    expect(p1.gold()).toBe(p1GoldBefore);

    game.addExecution(
      new SelectDevPathExecution(p1, DevelopmentPath.Political),
    );
    executeTicks(game, 2);
    expect(p1.primaryPath()).toBe(DevelopmentPath.Political);
    expect(game.isPathDraftActive()).toBe(true); // still waiting on p2

    game.addExecution(
      new SelectDevPathExecution(p2, DevelopmentPath.Scientific),
    );
    executeTicks(game, 2);
    expect(p2.primaryPath()).toBe(DevelopmentPath.Scientific);
    expect(game.isPathDraftActive()).toBe(false);

    executeTicks(game, 10);
    expect(p1.gold()).toBeGreaterThan(p1GoldBefore);
  });

  test("draft pauses simulation for all players and resumes only after all humans pick", async () => {
    const game = await createMultiplayerGame(GameType.Private);
    const p1 = game.player("p1");
    const p2 = game.player("p2");

    expect(game.isAugmentDraftActive()).toBe(false);
    expect(game.triggerAugmentDraft()).toBe(true);
    expect(game.isAugmentDraftActive()).toBe(true);

    // Both players receive 3 distinct augment choices simultaneously
    expect(p1.pendingAugmentChoices().length).toBe(AUGMENT_CHOICES_PER_ROUND);
    expect(p2.pendingAugmentChoices().length).toBe(AUGMENT_CHOICES_PER_ROUND);
    expect(new Set(p1.pendingAugmentChoices()).size).toBe(
      AUGMENT_CHOICES_PER_ROUND,
    );

    // Verify simulation is frozen while paused in draft
    const p1GoldBefore = p1.gold();
    const p1TroopsBefore = p1.troops();
    executeTicks(game, 20);
    expect(p1.gold()).toBe(p1GoldBefore);
    expect(p1.troops()).toBe(p1TroopsBefore);
    expect(game.isAugmentDraftActive()).toBe(true);

    // Player 1 picks: game MUST remain paused waiting for Player 2
    const p1Pick = p1.pendingAugmentChoices()[0];
    game.addExecution(new SelectAugmentExecution(p1, p1Pick));
    executeTicks(game, 2);
    expect(p1.selectedAugments()).toEqual([p1Pick]);
    expect(p1.pendingAugmentChoices()).toEqual([]);
    expect(game.isAugmentDraftActive()).toBe(true);

    // Player 2 picks: draft ends and simulation resumes
    const p2Pick = p2.pendingAugmentChoices()[1];
    game.addExecution(new SelectAugmentExecution(p2, p2Pick));
    executeTicks(game, 2);
    expect(p2.selectedAugments()).toEqual([p2Pick]);
    expect(game.isAugmentDraftActive()).toBe(false);

    // Normal gameplay ticks resume
    executeTicks(game, 10);
    expect(p1.gold()).toBeGreaterThan(p1GoldBefore);
  });

  test("multiplayer safety timeout auto-picks for AFK players so match never stalls", async () => {
    const game = await createMultiplayerGame(GameType.Private);
    const p1 = game.player("p1");
    const p2 = game.player("p2");

    expect(game.triggerAugmentDraft()).toBe(true);
    const p1Pick = p1.pendingAugmentChoices()[0];
    const p2First = p2.pendingAugmentChoices()[0];

    // Only p1 picks; p2 is AFK
    game.addExecution(new SelectAugmentExecution(p1, p1Pick));
    executeTicks(game, MULTIPLAYER_DRAFT_TIMEOUT_TICKS + 2);

    expect(game.isAugmentDraftActive()).toBe(false);
    expect(p2.selectedAugments()).toEqual([p2First]);
  });

  test("hard cap of 5 augments per player per match is strictly enforced", async () => {
    const game = await createMultiplayerGame(GameType.Private);
    const p1 = game.player("p1");
    const p2 = game.player("p2");

    for (let round = 0; round < MAX_AUGMENTS_PER_PLAYER; round++) {
      expect(game.triggerAugmentDraft()).toBe(true);
      game.addExecution(
        new SelectAugmentExecution(p1, p1.pendingAugmentChoices()[0]),
      );
      game.addExecution(
        new SelectAugmentExecution(p2, p2.pendingAugmentChoices()[0]),
      );
      executeTicks(game, 2);
      expect(game.isAugmentDraftActive()).toBe(false);
    }

    expect(p1.selectedAugments().length).toBe(MAX_AUGMENTS_PER_PLAYER);
    expect(new Set(p1.selectedAugments()).size).toBe(MAX_AUGMENTS_PER_PLAYER);

    // 6th round is rejected
    expect(game.triggerAugmentDraft()).toBe(false);
    expect(p1.selectedAugments().length).toBe(MAX_AUGMENTS_PER_PLAYER);
  });

  test("selected augments apply real modifiers to pathModifiers()", async () => {
    const game = await createMultiplayerGame(GameType.Private);
    const p1 = game.player("p1");

    const before = p1.pathModifiers();
    p1.offerAugmentChoices([
      AugmentId.TechnologicalRace,
      AugmentId.FortressNation,
      AugmentId.PeoplesFirst,
    ]);
    expect(p1.selectAugment(AugmentId.TechnologicalRace)).toBe(true);

    const after = p1.pathModifiers();
    expect(after.scienceRatePercent).toBe(before.scienceRatePercent + 50);
    expect(after.civilianTaxPercent).toBe(before.civilianTaxPercent - 15);
  });

  test("SelectAugmentIntent parses cleanly via IntentSchema", () => {
    expect(
      IntentSchema.parse({
        type: "select_augment",
        augmentId: AugmentId.TotalMobilisation,
      }),
    ).toEqual({
      type: "select_augment",
      augmentId: AugmentId.TotalMobilisation,
    });
  });

  test("snapshot round-trip preserves augment choices and selected augments byte-identically", async () => {
    const game = await createMultiplayerGame(GameType.Private);
    const p1 = game.player("p1");
    const p2 = game.player("p2");

    expect(game.triggerAugmentDraft()).toBe(true);
    game.addExecution(
      new SelectAugmentExecution(p1, p1.pendingAugmentChoices()[0]),
    );
    executeTicks(game, 5);
    // Snapshot mid-draft while p2 still hasn't picked
    await expectSnapshotRoundTrip(game, "plains", 15);
    expect(p2.pendingAugmentChoices().length).toBe(AUGMENT_CHOICES_PER_ROUND);
  });
});
