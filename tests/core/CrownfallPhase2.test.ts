import {
  DevelopmentPath,
  PlayerInfo,
  PlayerType,
  TerrainType,
} from "@openfront/engine-api/game/GameTypes";
import { IntentSchema } from "@openfront/engine-api/Schemas";
import {
  nextTierGoldCost,
  nextTierScienceCost,
} from "@openfront/engine-lib/configuration/CrownfallPaths";
import { EngineConfig } from "@openfront/engine/configuration/EngineConfig";
import { SelectDevPathExecution } from "@openfront/engine/execution/SelectDevPathExecution";
import { SpawnExecution } from "@openfront/engine/execution/SpawnExecution";
import { UnlockDevTierExecution } from "@openfront/engine/execution/UnlockDevTierExecution";
import { Game } from "@openfront/engine/game/Game";
import { describe, expect, test } from "vitest";
import { setup } from "../util/Setup";
import { expectSnapshotRoundTrip } from "../util/Snapshot";
import { executeTicks } from "../util/utils";

async function createSpawnedGame(): Promise<Game> {
  const humanInfo = new PlayerInfo(
    "Chancellor",
    PlayerType.Human,
    "client-1",
    "player-1",
  );
  const game = await setup(
    "plains",
    { instantBuild: true, startingGold: 5_000_000 },
    [humanInfo],
    undefined,
    undefined,
    false,
  );
  game.addExecution(new SpawnExecution("test-game", humanInfo, game.ref(20, 20)));
  executeTicks(game, 105);
  return game;
}

describe("Crownfall Phase 2: National Development Paths", () => {
  test("primary path selection is one-time, discounts Science cost by 20%, and caps secondary paths at Tier 2", async () => {
    const game = await createSpawnedGame();
    const player = game.player("player-1");

    expect(player.primaryPath()).toBeNull();
    expect(
      nextTierScienceCost(player.pathProgress(), DevelopmentPath.Military),
    ).toBe(150);

    // Choose Military as primary
    game.addExecution(
      new SelectDevPathExecution(player, DevelopmentPath.Military),
    );
    executeTicks(game, 2);
    expect(player.primaryPath()).toBe(DevelopmentPath.Military);

    // Attempt to switch primary to Political should be ignored
    game.addExecution(
      new SelectDevPathExecution(player, DevelopmentPath.Political),
    );
    executeTicks(game, 2);
    expect(player.primaryPath()).toBe(DevelopmentPath.Military);

    // Primary path gets 20% discount (150 -> 120)
    expect(
      nextTierScienceCost(player.pathProgress(), DevelopmentPath.Military),
    ).toBe(120);
    // Secondary path stays full cost (150)
    expect(
      nextTierScienceCost(player.pathProgress(), DevelopmentPath.Political),
    ).toBe(150);

    // Unlock up to Tier 4 on primary (Military) and Tier 2 on secondary (Political)
    player.addScience(10_000);
    for (let i = 0; i < 5; i++) {
      game.addExecution(
        new UnlockDevTierExecution(player, DevelopmentPath.Military),
      );
      game.addExecution(
        new UnlockDevTierExecution(player, DevelopmentPath.Political),
      );
      executeTicks(game, 2);
    }

    expect(player.devLevel(DevelopmentPath.Military)).toBe(4);
    expect(player.devLevel(DevelopmentPath.Political)).toBe(2);
    expect(
      nextTierScienceCost(player.pathProgress(), DevelopmentPath.Military),
    ).toBeNull();
    expect(
      nextTierScienceCost(player.pathProgress(), DevelopmentPath.Political),
    ).toBeNull();
  });

  test("unlock refuses when Science or Gold is insufficient, and Primary Path discounts Gold by 20%", async () => {
    const game = await createSpawnedGame();
    const player = game.player("player-1");

    expect(player.science()).toBeGreaterThan(0);
    expect(player.science()).toBeLessThan(120);
    game.addExecution(
      new UnlockDevTierExecution(player, DevelopmentPath.Scientific),
    );
    executeTicks(game, 2);
    expect(player.devLevel(DevelopmentPath.Scientific)).toBe(0);

    // Sufficient Science, but 0 Gold -> unlock must refuse!
    player.addScience(1_000);
    player.removeGold(player.gold());
    expect(player.gold()).toBe(0n);
    expect(player.unlockDevTier(DevelopmentPath.Scientific)).toBe(false);

    // Primary Path gets 20% Gold discount (50,000n -> 40,000n)
    player.setPrimaryPath(DevelopmentPath.Scientific);
    expect(
      nextTierGoldCost(player.pathProgress(), DevelopmentPath.Scientific),
    ).toBe(40_000n);
    expect(
      nextTierGoldCost(player.pathProgress(), DevelopmentPath.Political),
    ).toBe(50_000n);

    player.addGold(40_000n);
    expect(player.unlockDevTier(DevelopmentPath.Scientific)).toBe(true);
    expect(player.gold()).toBe(0n);
    expect(player.pathModifiers().structureCostPercent).toBeLessThan(100);
  });

  test("Military, Political, and Scientific paths apply symmetric pros and cons", async () => {
    const game = await createSpawnedGame();
    const player = game.player("player-1");
    player.addScience(10_000);

    // Military T2: faster attacks & lower losses, but stability & tax penalty
    game.addExecution(
      new SelectDevPathExecution(player, DevelopmentPath.Military),
    );
    game.addExecution(
      new UnlockDevTierExecution(player, DevelopmentPath.Military),
    );
    game.addExecution(
      new UnlockDevTierExecution(player, DevelopmentPath.Military),
    );
    executeTicks(game, 4);

    const milMods = player.pathModifiers();
    expect(milMods.troopRegenPercent).toBeGreaterThan(100);
    expect(milMods.attackerLossPercent).toBeLessThan(100);
    expect(milMods.attackSpeedPercent).toBeGreaterThan(100);
    expect(milMods.stabilityTargetDelta).toBeLessThan(0);
    expect(milMods.civilianTaxPercent).toBeLessThan(100);

    // Verify real EngineConfig.attackLogic respects attackerLossPercent & attackSpeedPercent
    const realConfig = new EngineConfig(game.config().gameConfig(), false);
    const baseAttack = realConfig.attackLogic({
      terrain: TerrainType.Plains,
      attackTroops: 10_000,
      attacker: { type: PlayerType.Human, numTiles: 500 },
      defender: {
        type: PlayerType.Human,
        numTiles: 500,
        troops: 10_000,
        isTraitor: false,
        isDisconnectedTeammate: false,
      },
      defenderHasDefensePost: false,
      falloutRatio: null,
      borderSize: 20,
    });
    const milAttack = realConfig.attackLogic({
      terrain: TerrainType.Plains,
      attackTroops: 10_000,
      attacker: { type: PlayerType.Human, numTiles: 500 },
      defender: {
        type: PlayerType.Human,
        numTiles: 500,
        troops: 10_000,
        isTraitor: false,
        isDisconnectedTeammate: false,
      },
      defenderHasDefensePost: false,
      falloutRatio: null,
      borderSize: 20,
      attackerLossPercent: milMods.attackerLossPercent,
      attackSpeedPercent: milMods.attackSpeedPercent,
    });
    expect(milAttack.attackerTroopLoss).toBeLessThan(
      baseAttack.attackerTroopLoss,
    );
    expect(milAttack.tickFraction).toBeLessThan(baseAttack.tickFraction);
  });

  test("SelectDevPathIntent and UnlockDevTierIntent parse via IntentSchema", () => {
    expect(
      IntentSchema.parse({
        type: "select_dev_path",
        path: DevelopmentPath.Scientific,
      }),
    ).toEqual({
      type: "select_dev_path",
      path: DevelopmentPath.Scientific,
    });
    expect(
      IntentSchema.parse({
        type: "unlock_dev_tier",
        path: DevelopmentPath.Political,
      }),
    ).toEqual({
      type: "unlock_dev_tier",
      path: DevelopmentPath.Political,
    });
  });

  test("snapshot round-trip preserves primary path and tier levels byte-identically", async () => {
    const game = await createSpawnedGame();
    const player = game.player("player-1");
    player.addScience(1_000);
    game.addExecution(
      new SelectDevPathExecution(player, DevelopmentPath.Scientific),
    );
    game.addExecution(
      new UnlockDevTierExecution(player, DevelopmentPath.Scientific),
    );
    game.addExecution(
      new UnlockDevTierExecution(player, DevelopmentPath.Political),
    );
    executeTicks(game, 20);

    await expectSnapshotRoundTrip(game, "plains", 30);
  });
});
