import {
  AllianceActionType,
  GameType,
  PlayerInfo,
  PlayerType,
} from "@openfront/engine-api/game/GameTypes";
import { IntentSchema } from "@openfront/engine-api/Schemas";
import { CROWNFALL_ALLIANCE_CONFIG } from "@openfront/engine-lib/configuration/CrownfallAlliances";
import { AllianceActionReplyExecution } from "@openfront/engine/execution/alliance/AllianceActionReplyExecution";
import { AllianceActionRequestExecution } from "@openfront/engine/execution/alliance/AllianceActionRequestExecution";
import { AllianceRequestExecution } from "@openfront/engine/execution/alliance/AllianceRequestExecution";
import { SpawnExecution } from "@openfront/engine/execution/SpawnExecution";
import { Game } from "@openfront/engine/game/Game";
import { describe, expect, test } from "vitest";
import { setup } from "../util/Setup";
import { expectSnapshotRoundTrip } from "../util/Snapshot";
import { executeTicks } from "../util/utils";

async function createThreePlayerGame(): Promise<Game> {
  const p1 = new PlayerInfo("AllyA", PlayerType.Human, "c1", "p1");
  const p2 = new PlayerInfo("AllyB", PlayerType.Human, "c2", "p2");
  const p3 = new PlayerInfo("EnemyC", PlayerType.Human, "c3", "p3");
  const game = await setup(
    "plains",
    { gameType: GameType.Private, instantBuild: true, startingGold: 1_000_000 },
    [p1, p2, p3],
    undefined,
    undefined,
    false,
  );
  game.addExecution(new SpawnExecution("test-game", p1, game.ref(15, 15)));
  game.addExecution(new SpawnExecution("test-game", p2, game.ref(40, 15)));
  game.addExecution(new SpawnExecution("test-game", p3, game.ref(40, 40)));
  executeTicks(game, 5);
  game.endSpawnPhase();
  executeTicks(game, 5);
  return game;
}

function formAlliance(game: Game, idA: string, idB: string): void {
  const a = game.player(idA);
  const b = game.player(idB);
  game.addExecution(new AllianceRequestExecution(a, b.id()));
  executeTicks(game, 2);
  game.addExecution(new AllianceRequestExecution(b, a.id()));
  executeTicks(game, 2);
  expect(a.isAlliedWith(b)).toBe(true);
}

describe("Crownfall Phase 4: Meaningful Alliances", () => {
  test("non-allied players cannot send alliance action requests", async () => {
    const game = await createThreePlayerGame();
    const p1 = game.player("p1");
    const p2 = game.player("p2");

    expect(
      game.createAllianceActionRequest(
        p1,
        p2,
        AllianceActionType.Reinforcements,
        null,
      ),
    ).toBeNull();
  });

  test("reinforcements request transfers capped troops on accept and transfers nothing on decline", async () => {
    const game = await createThreePlayerGame();
    formAlliance(game, "p1", "p2");
    const p1 = game.player("p1");
    const p2 = game.player("p2");

    p1.setTroops(10_000);
    p2.setTroops(50_000);

    // Request and decline -> no troops transferred
    const req1 = game.createAllianceActionRequest(
      p1,
      p2,
      AllianceActionType.Reinforcements,
      null,
    );
    expect(req1).not.toBeNull();
    expect(game.replyAllianceActionRequest(p2, req1!, false)).toBe(true);
    expect(p1.troops()).toBe(10_000);
    expect(p2.troops()).toBe(50_000);

    // Cooldown prevents immediate spam
    expect(
      game.createAllianceActionRequest(
        p1,
        p2,
        AllianceActionType.Reinforcements,
        null,
      ),
    ).toBeNull();

    // Advance past cooldown and accept
    executeTicks(game, CROWNFALL_ALLIANCE_CONFIG.requestCooldownTicks + 2);
    p1.setTroops(10_000);
    p2.setTroops(50_000);
    const req2 = game.createAllianceActionRequest(
      p1,
      p2,
      AllianceActionType.Reinforcements,
      null,
    );
    expect(req2).not.toBeNull();
    expect(game.replyAllianceActionRequest(p2, req2!, true)).toBe(true);
    expect(p1.troops()).toBe(20_000); // +20% of 50,000 = +10,000
    expect(p2.troops()).toBe(40_000);
  });

  test("joint attack and defense aid requests work through executions and respect expiration", async () => {
    const game = await createThreePlayerGame();
    formAlliance(game, "p1", "p2");
    const p1 = game.player("p1");
    const p2 = game.player("p2");
    const p3 = game.player("p3");

    // Make p2 and p3 share a border so AttackExecution can launch
    for (let x = 35; x <= 45; x++) {
      for (let y = 15; y <= 28; y++) {
        p2.conquer(game.ref(x, y));
      }
      for (let y = 29; y <= 42; y++) {
        p3.conquer(game.ref(x, y));
      }
    }

    // Request Joint Attack via execution
    game.addExecution(
      new AllianceActionRequestExecution(
        p1,
        p2.id(),
        AllianceActionType.JointAttack,
        p3.id(),
      ),
    );
    executeTicks(game, 2);

    // Accept via execution
    game.addExecution(new AllianceActionReplyExecution(p2, 1, true));
    executeTicks(game, 5);
    expect(p2.outgoingAttacks().length).toBeGreaterThan(0);

    // Test expiration
    executeTicks(game, CROWNFALL_ALLIANCE_CONFIG.requestCooldownTicks + 2);
    const expiringReq = game.createAllianceActionRequest(
      p1,
      p2,
      AllianceActionType.DefenseAid,
      p3,
    );
    expect(expiringReq).not.toBeNull();
    executeTicks(game, CROWNFALL_ALLIANCE_CONFIG.requestExpirationTicks + 12);
    expect(game.replyAllianceActionRequest(p2, expiringReq!, true)).toBe(false);
  });

  test("alliance action intents parse via IntentSchema", () => {
    expect(
      IntentSchema.parse({
        type: "alliance_action_request",
        recipientID: "PlayerTwo1",
        actionType: AllianceActionType.JointAttack,
        targetID: "PlayerThr2",
      }),
    ).toEqual({
      type: "alliance_action_request",
      recipientID: "PlayerTwo1",
      actionType: AllianceActionType.JointAttack,
      targetID: "PlayerThr2",
    });
    expect(
      IntentSchema.parse({
        type: "alliance_action_reply",
        requestID: 4,
        accept: true,
      }),
    ).toEqual({
      type: "alliance_action_reply",
      requestID: 4,
      accept: true,
    });
  });

  test("snapshot round-trip preserves pending alliance action requests byte-identically", async () => {
    const game = await createThreePlayerGame();
    formAlliance(game, "p1", "p2");
    const p1 = game.player("p1");
    const p2 = game.player("p2");

    expect(
      game.createAllianceActionRequest(
        p1,
        p2,
        AllianceActionType.Reinforcements,
        null,
      ),
    ).not.toBeNull();

    await expectSnapshotRoundTrip(game, "plains", 15);
  });
});
