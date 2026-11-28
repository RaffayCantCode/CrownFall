import { GameMap, TileRef } from "@openfront/engine-api/game/GameMap";
import {
  AllianceActionType,
  Cell,
  ColoredTeams,
  DevelopmentPath,
  Difficulty,
  Duos,
  EmojiMessage,
  GameMode,
  GameType,
  GameUpdates,
  Gold,
  HumansVsNations,
  MessageType,
  Nation,
  PlayerID,
  PlayerInfo,
  PlayerType,
  Quads,
  SpawnArea,
  Team,
  TeamGameSpawnAreas,
  TerrainType,
  TerraNullius,
  Tick,
  TradeAgreementType,
  Trios,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import {
  GameUpdate,
  GameUpdateType,
  PendingTradeRequestView,
  TradeAgreementView,
} from "@openfront/engine-api/game/GameUpdates";
import {
  ReadonlyTileSet,
  UnitPredicate,
} from "@openfront/engine-api/game/ReadViews";
import {
  AllPlayersStats,
  ClientID,
  GameID,
  Winner,
} from "@openfront/engine-api/Schemas";
import { ATTACK_INDEX_SENT } from "@openfront/engine-api/StatsSchemas";
import { CROWNFALL_ALLIANCE_CONFIG } from "@openfront/engine-lib/configuration/CrownfallAlliances";
import {
  CROWNFALL_BOUNTY_CONFIG,
  isEligibleBountyTargetType,
  rollScaledBountyReward,
} from "@openfront/engine-lib/configuration/CrownfallBounties";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import { maxFoodStorage } from "@openfront/engine-lib/configuration/CrownfallFood";
import { CROWNFALL_TRADE_CONFIG } from "@openfront/engine-lib/configuration/CrownfallTrade";
import { completedStructureLevels } from "@openfront/engine-lib/configuration/CrownfallConfig";
import {
  AUGMENT_ROUND_TICKS,
  MAX_AUGMENTS_PER_PLAYER,
  MULTIPLAYER_DRAFT_TIMEOUT_TICKS,
  rollAugmentChoices,
} from "@openfront/engine-lib/configuration/CrownfallAugments";
import { renderNumber } from "@openfront/engine-lib/Format";
import { GameMapImpl } from "@openfront/engine-lib/game/GameMapImpl";
import {
  MotionPlanRecord,
  packMotionPlans,
} from "@openfront/engine-lib/game/MotionPlans";
import {
  assignTeams,
  resolveTeamsList,
} from "@openfront/engine-lib/game/TeamAssignment";
import { TerraNulliusImpl } from "@openfront/engine-lib/game/TerraNulliusImpl";
import { UnitGrid } from "@openfront/engine-lib/game/UnitGrid";
import {
  readVersioned,
  snapshotType,
  VersionedSchema,
  zInt,
  zPlayerRef,
  zRef,
} from "@openfront/engine-lib/snapshot/SnapshotType";
import { simpleHash } from "@openfront/engine-lib/Util";
import { z } from "zod";
import { EngineConfig } from "../configuration/EngineConfig";
import {
  SharedWaterCache,
  SharedWaterCacheSnapshot,
} from "../execution/nation/SharedWaterCache";
import { AttackExecution } from "../execution/AttackExecution";
import { MarkDisconnectedExecution } from "../execution/MarkDisconnectedExecution";
import { NationExecution } from "../execution/NationExecution";
import { SelectAugmentExecution } from "../execution/SelectAugmentExecution";
import { SelectDevPathExecution } from "../execution/SelectDevPathExecution";
import { SpawnTimerExecution } from "../execution/SpawnTimerExecution";
import { TribeExecution } from "../execution/TribeExecution";
import { AbstractGraph } from "../pathfinding/algorithms/AbstractGraph";
import { WaterPathFinder } from "../pathfinding/PathFinder";
import { PathFinder } from "../pathfinding/types";
import {
  nationData,
  NationSchema,
  playerInfoData,
  PlayerInfoSchema,
  UnitTypeSchema,
} from "../snapshot/CommonSchemas";
import type {
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";
import { AllianceImpl } from "./AllianceImpl";
import { AllianceRequestImpl } from "./AllianceRequestImpl";
import {
  Alliance,
  AllianceRequest,
  EngineUnitInfo,
  Execution,
  Game,
  MutableAlliance,
  Player,
  Unit,
} from "./Game";
import { PlayerImpl } from "./PlayerImpl";
import { RailNetwork } from "./RailNetwork";
import {
  createRailNetwork,
  RailNetworkImpl,
  RailNetworkSnapshot,
} from "./RailNetworkImpl";
import { Railroad } from "./Railroad";
import { Stats } from "./Stats";
import { StatsImpl, StatsSnapshot } from "./StatsImpl";
import { WaterManager, WaterManagerSnapshot } from "./WaterManager";

export function createGame(
  humans: PlayerInfo[],
  nations: Nation[],
  gameMap: GameMap,
  miniGameMap: GameMap,
  config: EngineConfig,
  teamGameSpawnAreas?: TeamGameSpawnAreas,
): Game {
  const stats = new StatsImpl();
  return new GameImpl(
    humans,
    nations,
    gameMap,
    miniGameMap,
    config,
    stats,
    teamGameSpawnAreas,
  );
}

export type CellString = string;

export class GameImpl implements Game {
  private _ticks = 0;
  private startTick: number | null = null;

  private unInitExecs: Execution[] = [];

  _players: Map<PlayerID, PlayerImpl> = new Map<PlayerID, PlayerImpl>();
  _playersBySmallID: Player[] = [];

  private execs: Execution[] = [];
  private _width: number;
  private _height: number;
  _terraNullius: TerraNulliusImpl;

  allianceRequests: AllianceRequestImpl[] = [];

  private nextPlayerID = 1;
  private _nextUnitID = 1;

  private updates: GameUpdates = createGameUpdatesMap();
  private tileUpdatePairs: number[] = [];
  private viewResyncQueued = false;
  /** [smallID, tilesOwned, gold, troops] quads — see PlayerImpl.toUpdate. */
  private playerStatsQuads: number[] = [];
  /** [smallID, direction, index, troops] quads — see packAttackTroopDeltas. */
  private attackTroopsQuads: number[] = [];
  private motionPlanRecords: MotionPlanRecord[] = [];
  private planDrivenUnitIds = new Set<number>();
  private unitGrid: UnitGrid<Unit>;
  private _unitMap = new Map<number, Unit>();

  private playerTeams: Team[] = [];
  private botTeam: Team = ColoredTeams.Bot;
  private _railNetwork: RailNetwork = createRailNetwork(this);

  // Used to assign unique IDs to each new alliance
  private nextAllianceID: number = 0;

  private _mirvsLaunched = 0;
  private shipStaggers = { tradeShip: 0, transportShip: 0 };
  private _nationMirvTargets = new Map<PlayerID, Tick>();

  private _isPaused: boolean = false;
  private _pathDraftTriggered: boolean = false;
  private _pathDraftActive: boolean = false;
  private _augmentRoundsTriggered: number = 0;
  private _augmentDraftActive: boolean = false;
  private _augmentDraftTicksRemaining: number = -1;
  private _activeGameplayTicks: number = 0;
  private _nextAllianceActionID: number = 1;
  private _pendingAllianceActions: {
    id: number;
    requestorID: PlayerID;
    recipientID: PlayerID;
    actionType: AllianceActionType;
    targetID: PlayerID | null;
    createdAt: Tick;
    expiresAt: Tick;
  }[] = [];
  private _allianceActionCooldowns = new Map<string, Tick>();
  private _nextTradeID: number = 1;
  private _pendingTradeRequests: PendingTradeRequestView[] = [];
  private _activeTradeAgreements: TradeAgreementView[] = [];
  private _tradeCooldowns = new Map<string, Tick>();
  private _activeBountyTargetID: PlayerID | null = null;
  private _bountyExpiresTick: Tick = 0;
  private _nextBountyEligibleTick: Tick =
    CROWNFALL_BOUNTY_CONFIG.firstBountyDelayTicks;
  private _lastBountyTargetID: PlayerID | null = null;
  private _bountiesTriggered: number = 0;
  private _bountyTilesConquered = new Map<PlayerID, number>();
  private _bountyClaimsByPlayer = new Map<PlayerID, number>();
  private _winner: Player | Team | null = null;
  private _waterManager: WaterManager;
  private _sharedWaterCache: SharedWaterCache;
  private _teamGameSpawnAreas: TeamGameSpawnAreas | undefined;
  /** Tiles from nuke blast radii this tick, drained by the renderer. */
  private _nukeImpactQueue: TileRef[] = [];

  constructor(
    private _humans: PlayerInfo[],
    private _nations: Nation[],
    private _map: GameMap,
    private miniGameMap: GameMap,
    private _config: EngineConfig,
    private _stats: Stats,
    teamGameSpawnAreas?: TeamGameSpawnAreas,
    // Restoring a snapshot: skip team and player setup, the snapshot
    // supplies both (see restoreState).
    restoring: boolean = false,
  ) {
    const constructorStart = performance.now();

    this._teamGameSpawnAreas = teamGameSpawnAreas;
    this._terraNullius = new TerraNulliusImpl();
    this._width = _map.width();
    this._height = _map.height();
    this.unitGrid = new UnitGrid<Unit>(this._map);
    this._waterManager = new WaterManager(
      this._map,
      this.miniGameMap,
      _config.disableNavMesh(),
    );
    this._sharedWaterCache = new SharedWaterCache(this);

    if (!restoring) {
      if (_config.gameConfig().gameMode === GameMode.Team) {
        this.populateTeams();
      }
      this.addPlayers();
    }

    console.log(
      `[GameImpl] Constructor total: ${(performance.now() - constructorStart).toFixed(0)}ms`,
    );
  }

  private populateTeams() {
    const totalPlayers = this._humans.length + this._nations.length;
    this.playerTeams = resolveTeamsList(
      this._config.playerTeams(),
      totalPlayers,
    );
  }

  private addPlayers() {
    if (this.config().gameConfig().gameMode === GameMode.FFA) {
      this._humans.forEach((p) => this.addPlayer(p));
      this._nations.forEach((n) => this.addPlayer(n.playerInfo));
      return;
    }

    if (this._config.playerTeams() === HumansVsNations) {
      this._humans.forEach((p) => this.addPlayer(p, ColoredTeams.Humans));
      this._nations.forEach((n) =>
        this.addPlayer(n.playerInfo, ColoredTeams.Nations),
      );
      return;
    }

    // Team mode
    const allPlayers = [
      ...this._humans,
      ...this._nations.map((n) => n.playerInfo),
    ];
    const pt = this._config.playerTeams();
    const isDuosTriosQuads = pt === Duos || pt === Trios || pt === Quads;
    const playerToTeam = assignTeams(
      allPlayers,
      this.playerTeams,
      isDuosTriosQuads,
    );
    for (const [playerInfo, team] of playerToTeam.entries()) {
      if (team === "kicked") {
        console.warn(`Player ${playerInfo.name} was kicked from team`);
        continue;
      }
      this.addPlayer(playerInfo, team);
    }
  }

  isOnEdgeOfMap(ref: TileRef): boolean {
    return this._map.isOnEdgeOfMap(ref);
  }

  owner(ref: TileRef): Player | TerraNullius {
    return this.playerBySmallID(this.ownerID(ref));
  }

  playerBySmallID(id: number): Player | TerraNullius {
    if (id === 0) {
      return this.terraNullius();
    }
    return this._playersBySmallID[id - 1];
  }
  map(): GameMap {
    return this._map;
  }
  miniMap(): GameMap {
    return this.miniGameMap;
  }

  addUpdate(update: GameUpdate) {
    (this.updates[update.type] as GameUpdate[]).push(update);
  }

  nextUnitID(): number {
    const old = this._nextUnitID;
    this._nextUnitID++;
    return old;
  }

  setFallout(tile: TileRef, value: boolean) {
    if (value && this.hasOwner(tile)) {
      throw Error(`cannot set fallout, tile ${tile} has owner`);
    }
    if (this._map.hasFallout(tile)) {
      return;
    }
    this._territoryVersion++;
    this._map.setFallout(tile, value);
    this.recordTileUpdate(tile);
  }

  setWater(tile: TileRef): void {
    if (!this.isLand(tile)) return;
    if (this.hasOwner(tile)) {
      throw Error(`cannot set water, tile ${tile} has owner`);
    }
    // Clear fallout if present (water tiles shouldn't have fallout)
    if (this._map.hasFallout(tile)) {
      this._map.setFallout(tile, false);
    }
    this._territoryVersion++;
    // Rail paths route around water, so a rail plan must be redone too.
    this._structureVersion++;
    this._map.setWater(tile);
    this.recordTileUpdate(tile);
  }

  queueWaterConversion(tile: TileRef): void {
    if (!this.isLand(tile)) return;
    if (this.hasOwner(tile)) {
      throw Error(`cannot queue water conversion, tile ${tile} has owner`);
    }
    if (!this._config.waterNukes()) {
      this.setFallout(tile, true);
      return;
    }
    this._waterManager.queueTile(tile);
  }

  queueNukeImpact(tile: TileRef): void {
    this._nukeImpactQueue.push(tile);
  }

  drainNukeImpacts(): TileRef[] {
    const tiles = this._nukeImpactQueue;
    this._nukeImpactQueue = [];
    return tiles;
  }

  unit(id: number): Unit | undefined {
    return this._unitMap.get(id);
  }

  units(): Unit[];
  units(types: readonly UnitType[]): Unit[];
  units(type: UnitType, type2?: UnitType, type3?: UnitType): Unit[];
  units(
    first?: UnitType | readonly UnitType[],
    second?: UnitType,
    third?: UnitType,
  ): Unit[] {
    // Built as a single flat array per call; per-player intermediate arrays
    // would churn the heap (player.units() with no args is allocation-free).
    const out: Unit[] = [];
    if (Array.isArray(first) && (first as readonly UnitType[]).length > 0) {
      const ts = new Set(first as readonly UnitType[]);
      for (const p of this._players.values()) {
        for (const u of p.units()) {
          if (ts.has(u.type())) out.push(u);
        }
      }
      return out;
    }
    if (first === undefined || Array.isArray(first)) {
      for (const p of this._players.values()) {
        for (const u of p.units()) {
          out.push(u);
        }
      }
      return out;
    }
    if (second === undefined) {
      const type = first as UnitType;
      // Single-type query: every nation asks for e.g. all transport ships on
      // every tick, and walking every player's unit list each time was ~3 %
      // of a headless game. The memo is exact — it is invalidated by any
      // unit list change — and callers get their own copy.
      const memo = this.unitsByTypeMemo.get(type);
      if (memo !== undefined && memo.version === this._unitsVersion) {
        return memo.units.slice();
      }
      for (const p of this._players.values()) {
        for (const u of p.units()) {
          if (u.type() === type) out.push(u);
        }
      }
      this.unitsByTypeMemo.set(type, {
        version: this._unitsVersion,
        units: out,
      });
      return out.slice();
    }
    for (const p of this._players.values()) {
      for (const u of p.units()) {
        const t = u.type();
        if (t === first || t === second || t === third) {
          out.push(u);
        }
      }
    }
    return out;
  }

  // Level-weighted count of one unit type across every player. Every port asked
  // for the trade-ship count every tick, and the walk over every player's unit
  // list was ~3.5 % of a long headless game. Memoised on the units version, which
  // moves on any unit list change and on every level-up (UnitImpl.increaseLevel).
  private readonly unitCountMemo = new Map<
    UnitType,
    { version: number; count: number }
  >();
  unitCount(type: UnitType): number {
    const memo = this.unitCountMemo.get(type);
    if (memo !== undefined && memo.version === this._unitsVersion) {
      return memo.count;
    }
    let total = 0;
    for (const player of this._players.values()) {
      total += player.unitCount(type);
    }
    this.unitCountMemo.set(type, { version: this._unitsVersion, count: total });
    return total;
  }

  unitInfo(type: UnitType): EngineUnitInfo {
    return this.config().unitInfo(type);
  }

  nations(): Nation[] {
    return this._nations;
  }

  createAllianceRequest(
    requestor: Player,
    recipient: Player,
  ): AllianceRequest | null {
    if (requestor.isAlliedWith(recipient)) {
      console.log("cannot request alliance, already allied");
      return null;
    }
    if (
      recipient
        .incomingAllianceRequests()
        .find((ar) => ar.requestor() === requestor) !== undefined
    ) {
      console.log(`duplicate alliance request from ${requestor.name()}`);
      return null;
    }
    const correspondingReq = requestor
      .incomingAllianceRequests()
      .find((ar) => ar.requestor() === recipient);
    if (correspondingReq !== undefined) {
      console.log(`got corresponding alliance requests, accepting`);
      correspondingReq.accept();
      return null;
    }
    const ar = new AllianceRequestImpl(requestor, recipient, this._ticks, this);
    this.allianceRequests.push(ar);
    this.addUpdate(ar.toUpdate());
    return ar;
  }

  acceptAllianceRequest(request: AllianceRequestImpl) {
    this.allianceRequests = this.allianceRequests.filter(
      (ar) => ar !== request,
    );

    const requestor = request.requestor();
    const recipient = request.recipient();

    const existing = requestor.allianceWith(recipient);
    if (existing) {
      throw new Error(
        `cannot accept alliance request, already allied with ${recipient.name()}`,
      );
    }

    // Create and register the new alliance
    const alliance = new AllianceImpl(
      this,
      requestor as PlayerImpl,
      recipient as PlayerImpl,
      this._ticks,
      this.nextAllianceID++,
    );
    (alliance.requestor() as PlayerImpl)._alliances.push(alliance);
    (alliance.recipient() as PlayerImpl)._alliances.push(alliance);
    this.stats().allianceFormed(requestor);
    this.stats().allianceFormed(recipient);
    (request.requestor() as PlayerImpl).pastOutgoingAllianceRequests.push(
      request,
    );

    this.addUpdate({
      type: GameUpdateType.AllianceRequestReply,
      request: request.toUpdate(),
      accepted: true,
    });
  }

  rejectAllianceRequest(request: AllianceRequestImpl) {
    this.allianceRequests = this.allianceRequests.filter(
      (ar) => ar !== request,
    );
    (request.requestor() as PlayerImpl).pastOutgoingAllianceRequests.push(
      request,
    );
    this.addUpdate({
      type: GameUpdateType.AllianceRequestReply,
      request: request.toUpdate(),
      accepted: false,
    });
  }

  hasPlayer(id: PlayerID): boolean {
    return this._players.has(id);
  }
  config(): EngineConfig {
    return this._config;
  }

  isPaused(): boolean {
    return this._isPaused;
  }

  setPaused(paused: boolean): void {
    this._isPaused = paused;
    this.addUpdate({ type: GameUpdateType.GamePaused, paused });
  }

  isAugmentDraftActive(): boolean {
    return this._augmentDraftActive;
  }

  isPathDraftActive(): boolean {
    return this._pathDraftActive;
  }

  createAllianceActionRequest(
    requestor: Player,
    recipient: Player,
    actionType: AllianceActionType,
    target: Player | null,
  ): number | null {
    if (!requestor.isAlive() || !recipient.isAlive() || requestor === recipient) {
      return null;
    }
    if (this._config.disableAlliances()) {
      return null;
    }
    if (!requestor.isFriendly(recipient)) {
      return null;
    }
    if (actionType === AllianceActionType.JointAttack) {
      if (target === null || !target.isAlive() || recipient.isFriendly(target)) {
        return null;
      }
    } else if (actionType === AllianceActionType.TroopsForGold) {
      if (requestor.gold() < CROWNFALL_ALLIANCE_CONFIG.troopsForGoldMinPayment) {
        return null;
      }
    } else if (actionType === AllianceActionType.GoldForTroops) {
      if (requestor.troops() < CROWNFALL_ALLIANCE_CONFIG.goldForTroopsMinTroops) {
        return null;
      }
    }

    const pairKey = `${requestor.id()}:${recipient.id()}`;
    const lastTick = this._allianceActionCooldowns.get(pairKey);
    if (
      lastTick !== undefined &&
      this._ticks - lastTick < CROWNFALL_ALLIANCE_CONFIG.requestCooldownTicks
    ) {
      return null;
    }

    // Reject duplicate active request for the same pair
    const existing = this._pendingAllianceActions.some(
      (r) =>
        r.requestorID === requestor.id() &&
        r.recipientID === recipient.id() &&
        r.expiresAt > this._ticks,
    );
    if (existing) {
      return null;
    }

    const id = this._nextAllianceActionID++;
    const expiresAt =
      this._ticks + CROWNFALL_ALLIANCE_CONFIG.requestExpirationTicks;
    this._pendingAllianceActions.push({
      id,
      requestorID: requestor.id(),
      recipientID: recipient.id(),
      actionType,
      targetID: target ? target.id() : null,
      createdAt: this._ticks,
      expiresAt,
    });
    this._allianceActionCooldowns.set(pairKey, this._ticks);

    this.addUpdate({
      type: GameUpdateType.AllianceActionRequest,
      requestID: id,
      requestorID: requestor.smallID(),
      recipientID: recipient.smallID(),
      actionType,
      targetID: target ? target.smallID() : null,
      createdAt: this._ticks,
      expiresAt,
    });
    return id;
  }

  pendingAllianceActionsFor(recipient: Player) {
    if (this._pendingAllianceActions.length === 0) return [];
    return this._pendingAllianceActions.filter(
      (r) => r.recipientID === recipient.id() && r.expiresAt > this._ticks,
    );
  }

  replyAllianceActionRequest(
    recipient: Player,
    requestID: number,
    accept: boolean,
  ): boolean {
    const idx = this._pendingAllianceActions.findIndex(
      (r) => r.id === requestID,
    );
    if (idx === -1) return false;
    const req = this._pendingAllianceActions[idx];
    if (req.recipientID !== recipient.id()) return false;
    this._pendingAllianceActions.splice(idx, 1);

    if (req.expiresAt <= this._ticks || !this.hasPlayer(req.requestorID)) {
      return false;
    }
    const requestor = this.player(req.requestorID);
    if (!requestor.isAlive() || !recipient.isAlive() || !requestor.isFriendly(recipient)) {
      return false;
    }

    let executed = false;
    let troopsAmount: number | undefined;
    let goldAmount: Gold | undefined;
    const targetSmallID =
      req.targetID !== null && this.hasPlayer(req.targetID)
        ? this.player(req.targetID).smallID()
        : null;

    if (accept) {
      if (req.actionType === AllianceActionType.JointAttack) {
        if (req.targetID !== null && this.hasPlayer(req.targetID)) {
          const target = this.player(req.targetID);
          if (target.isAlive() && !recipient.isFriendly(target)) {
            const troops = Math.floor(
              (recipient.troops() *
                CROWNFALL_ALLIANCE_CONFIG.jointAttackTroopPercent) /
                100,
            );
            if (troops > 0) {
              if (recipient.sharesBorderWith(target)) {
                this.addExecution(
                  new AttackExecution(troops, recipient, target.id(), null),
                );
                recipient.target(target);
                troopsAmount = troops;
                executed = true;
              } else {
                const freeCap = Math.max(
                  0,
                  Math.floor(
                    this.config().maxTroops(requestor) - requestor.troops(),
                  ),
                );
                const toSend = Math.min(
                  troops,
                  CROWNFALL_ALLIANCE_CONFIG.maxReinforcementTroops,
                  freeCap,
                );
                if (toSend > 0) {
                  recipient.removeTroops(toSend);
                  requestor.addTroops(toSend);
                  recipient.target(target);
                  troopsAmount = toSend;
                  executed = true;
                }
              }
            }
          }
        }
      } else if (req.actionType === AllianceActionType.Reinforcements) {
        const share = Math.floor(
          (recipient.troops() *
            CROWNFALL_ALLIANCE_CONFIG.reinforcementTroopPercent) /
            100,
        );
        const freeCap = Math.max(
          0,
          Math.floor(this.config().maxTroops(requestor) - requestor.troops()),
        );
        const toSend = Math.min(
          share,
          CROWNFALL_ALLIANCE_CONFIG.maxReinforcementTroops,
          freeCap,
        );
        if (toSend > 0) {
          recipient.removeTroops(toSend);
          requestor.addTroops(toSend);
          troopsAmount = toSend;
          executed = true;
        }
      } else if (req.actionType === AllianceActionType.DefenseAid) {
        const share = Math.floor(
          (recipient.troops() *
            CROWNFALL_ALLIANCE_CONFIG.defenseAidTroopPercent) /
            100,
        );
        const freeCap = Math.max(
          0,
          Math.floor(this.config().maxTroops(requestor) - requestor.troops()),
        );
        const toSend = Math.min(
          share,
          CROWNFALL_ALLIANCE_CONFIG.maxReinforcementTroops,
          freeCap,
        );
        let totalCommitted = 0;
        if (toSend > 0) {
          recipient.removeTroops(toSend);
          requestor.addTroops(toSend);
          totalCommitted += toSend;
          executed = true;
        }
        if (req.targetID !== null && this.hasPlayer(req.targetID)) {
          const invader = this.player(req.targetID);
          if (
            invader.isAlive() &&
            !recipient.isFriendly(invader) &&
            recipient.sharesBorderWith(invader)
          ) {
            const counterTroops = Math.floor(
              (recipient.troops() *
                CROWNFALL_ALLIANCE_CONFIG.defenseAidCounterAttackPercent) /
                100,
            );
            if (counterTroops > 0) {
              this.addExecution(
                new AttackExecution(
                  counterTroops,
                  recipient,
                  invader.id(),
                  null,
                ),
              );
              totalCommitted += counterTroops;
              executed = true;
            }
          }
        }
        if (totalCommitted > 0) {
          troopsAmount = totalCommitted;
        }
      } else if (req.actionType === AllianceActionType.TroopsForGold) {
        const payment =
          requestor.gold() >=
          CROWNFALL_ALLIANCE_CONFIG.troopsForGoldStandardPayment
            ? CROWNFALL_ALLIANCE_CONFIG.troopsForGoldStandardPayment
            : requestor.gold() >=
                CROWNFALL_ALLIANCE_CONFIG.troopsForGoldMinPayment
              ? CROWNFALL_ALLIANCE_CONFIG.troopsForGoldMinPayment
              : 0n;
        const share = Math.floor(
          (recipient.troops() *
            CROWNFALL_ALLIANCE_CONFIG.troopsForGoldTroopPercent) /
            100,
        );
        const freeCap = Math.max(
          0,
          Math.floor(this.config().maxTroops(requestor) - requestor.troops()),
        );
        const toSend = Math.min(
          share,
          CROWNFALL_ALLIANCE_CONFIG.maxReinforcementTroops,
          freeCap,
        );
        if (payment > 0n && toSend > 0) {
          const paid = requestor.removeGold(payment);
          recipient.addGold(paid);
          recipient.removeTroops(toSend);
          requestor.addTroops(toSend);
          goldAmount = paid;
          troopsAmount = toSend;
          executed = true;
        }
      } else if (req.actionType === AllianceActionType.GoldForTroops) {
        const payout =
          recipient.gold() >=
          CROWNFALL_ALLIANCE_CONFIG.goldForTroopsStandardPayout
            ? CROWNFALL_ALLIANCE_CONFIG.goldForTroopsStandardPayout
            : recipient.gold() >=
                CROWNFALL_ALLIANCE_CONFIG.goldForTroopsMinPayout
              ? CROWNFALL_ALLIANCE_CONFIG.goldForTroopsMinPayout
              : 0n;
        const share = Math.floor(
          (requestor.troops() *
            CROWNFALL_ALLIANCE_CONFIG.goldForTroopsSendPercent) /
            100,
        );
        const allyFreeCap = Math.max(
          0,
          Math.floor(this.config().maxTroops(recipient) - recipient.troops()),
        );
        const toSend = Math.min(
          share,
          CROWNFALL_ALLIANCE_CONFIG.maxReinforcementTroops,
          allyFreeCap,
        );
        if (payout > 0n && toSend > 0) {
          const paid = recipient.removeGold(payout);
          requestor.addGold(paid);
          requestor.removeTroops(toSend);
          recipient.addTroops(toSend);
          goldAmount = paid;
          troopsAmount = toSend;
          executed = true;
        }
      } else if (req.actionType === AllianceActionType.GoldAid) {
        const rawShare =
          (recipient.gold() * BigInt(CROWNFALL_ALLIANCE_CONFIG.goldAidPercent)) /
          100n;
        const toSend =
          rawShare > CROWNFALL_ALLIANCE_CONFIG.maxGoldAid
            ? CROWNFALL_ALLIANCE_CONFIG.maxGoldAid
            : rawShare;
        if (toSend >= CROWNFALL_ALLIANCE_CONFIG.minGoldAid) {
          const sent = recipient.removeGold(toSend);
          requestor.addGold(sent);
          goldAmount = sent;
          executed = true;
        }
      }
    }

    this.addUpdate({
      type: GameUpdateType.AllianceActionReply,
      requestID: req.id,
      requestorID: requestor.smallID(),
      recipientID: recipient.smallID(),
      actionType: req.actionType,
      accepted: accept && executed,
      troopsAmount,
      goldAmount,
      targetID: targetSmallID,
      reason: !accept ? "declined" : !executed ? "insufficient" : undefined,
    });
    return true;
  }

  private tradePairKey(a: PlayerID, b: PlayerID): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  private arePlayersAtWarOrHostile(a: Player, b: Player): boolean {
    if (!a.isAlive() || !b.isAlive()) return true;
    if (a.hasEmbargoAgainst(b) || b.hasEmbargoAgainst(a)) return true;
    for (const atk of a.outgoingAttacks()) {
      if (atk.target() === b) return true;
    }
    for (const atk of b.outgoingAttacks()) {
      if (atk.target() === a) return true;
    }
    return false;
  }

  private canPlayersTrade(a: Player, b: Player): boolean {
    if (this._config.disableTrade()) return false;
    if (a === b || a.type() === PlayerType.Bot || b.type() === PlayerType.Bot) {
      return false;
    }
    if (this.arePlayersAtWarOrHostile(a, b)) return false;
    return a.isFriendly(b) || a.sharesBorderWith(b);
  }

  tradeAgreementsFor(player: Player): readonly TradeAgreementView[] {
    if (this._activeTradeAgreements.length === 0) return [];
    const pid = player.id();
    return this._activeTradeAgreements.filter(
      (t) => t.proposerID === pid || t.partnerID === pid,
    );
  }

  pendingTradeRequestsFor(recipient: Player): readonly PendingTradeRequestView[] {
    if (this._pendingTradeRequests.length === 0) return [];
    const pid = recipient.id();
    return this._pendingTradeRequests.filter(
      (r) => r.recipientID === pid && r.expiresAt > this._ticks,
    );
  }

  createTradeRequest(
    proposer: Player,
    recipient: Player,
    tradeType: TradeAgreementType,
  ): number | null {
    if (!this.canPlayersTrade(proposer, recipient)) return null;
    if (
      (tradeType === TradeAgreementType.ImportFood ||
        tradeType === TradeAgreementType.ExportFood) &&
      this._config.disableFood()
    ) {
      return null;
    }
    if (
      this.tradeAgreementsFor(proposer).length >=
        CROWNFALL_TRADE_CONFIG.maxActiveAgreementsPerPlayer ||
      this.tradeAgreementsFor(recipient).length >=
        CROWNFALL_TRADE_CONFIG.maxActiveAgreementsPerPlayer
    ) {
      return null;
    }

    const pairKey = this.tradePairKey(proposer.id(), recipient.id());
    const lastCooldown = this._tradeCooldowns.get(pairKey);
    if (
      lastCooldown !== undefined &&
      this._ticks - lastCooldown < CROWNFALL_TRADE_CONFIG.cooldownTicks
    ) {
      return null;
    }

    const alreadyPaired = this._activeTradeAgreements.some(
      (t) =>
        this.tradePairKey(t.proposerID, t.partnerID) === pairKey,
    );
    if (alreadyPaired) return null;

    const alreadyPending = this._pendingTradeRequests.some(
      (r) =>
        this.tradePairKey(r.proposerID, r.recipientID) === pairKey &&
        r.expiresAt > this._ticks,
    );
    if (alreadyPending) return null;

    const id = this._nextTradeID++;
    this._pendingTradeRequests.push({
      id,
      proposerID: proposer.id(),
      recipientID: recipient.id(),
      tradeType,
      createdAt: this._ticks,
      expiresAt: this._ticks + CROWNFALL_TRADE_CONFIG.requestDurationTicks,
    });
    return id;
  }

  replyTradeRequest(
    recipient: Player,
    requestID: number,
    accept: boolean,
  ): boolean {
    const idx = this._pendingTradeRequests.findIndex((r) => r.id === requestID);
    if (idx === -1) return false;
    const req = this._pendingTradeRequests[idx];
    if (req.recipientID !== recipient.id()) return false;
    this._pendingTradeRequests.splice(idx, 1);

    if (req.expiresAt <= this._ticks || !this.hasPlayer(req.proposerID)) {
      return false;
    }
    const proposer = this.player(req.proposerID);
    const pairKey = this.tradePairKey(proposer.id(), recipient.id());

    if (!accept) {
      this._tradeCooldowns.set(pairKey, this._ticks);
      this.displayMessage(
        "crownfall.trade_declined",
        MessageType.ALLIANCE_REJECTED,
        proposer.id(),
        undefined,
        { name: recipient.displayName() },
      );
      return true;
    }

    if (
      !this.canPlayersTrade(proposer, recipient) ||
      this.tradeAgreementsFor(proposer).length >=
        CROWNFALL_TRADE_CONFIG.maxActiveAgreementsPerPlayer ||
      this.tradeAgreementsFor(recipient).length >=
        CROWNFALL_TRADE_CONFIG.maxActiveAgreementsPerPlayer
    ) {
      return false;
    }

    this._activeTradeAgreements.push({
      id: req.id,
      proposerID: proposer.id(),
      partnerID: recipient.id(),
      tradeType: req.tradeType,
      createdAt: this._ticks,
    });

    this.displayMessage(
      "crownfall.trade_accepted",
      MessageType.ALLIANCE_ACCEPTED,
      proposer.id(),
      undefined,
      { name: recipient.displayName() },
    );
    this.displayMessage(
      "crownfall.trade_accepted",
      MessageType.ALLIANCE_ACCEPTED,
      recipient.id(),
      undefined,
      { name: proposer.displayName() },
    );
    return true;
  }

  cancelTradeAgreement(actor: Player, agreementID: number): boolean {
    const idx = this._activeTradeAgreements.findIndex(
      (t) => t.id === agreementID,
    );
    if (idx === -1) return false;
    const agr = this._activeTradeAgreements[idx];
    if (agr.proposerID !== actor.id() && agr.partnerID !== actor.id()) {
      return false;
    }
    if (
      this._ticks - agr.createdAt <
      CROWNFALL_TRADE_CONFIG.minAgreementDurationTicks
    ) {
      return false;
    }
    this._activeTradeAgreements.splice(idx, 1);
    this._tradeCooldowns.set(
      this.tradePairKey(agr.proposerID, agr.partnerID),
      this._ticks,
    );
    const otherID =
      agr.proposerID === actor.id() ? agr.partnerID : agr.proposerID;
    if (this.hasPlayer(otherID)) {
      this.displayMessage(
        "crownfall.trade_cancelled",
        MessageType.ALLIANCE_BROKEN,
        otherID,
        undefined,
        { name: actor.displayName() },
      );
    }
    return true;
  }

  private tickTradeAgreements(): void {
    if (this._pendingTradeRequests.length > 0) {
      this._pendingTradeRequests = this._pendingTradeRequests.filter(
        (r) => r.expiresAt > this._ticks,
      );
    }
    if (this._config.disableTrade() || this._activeTradeAgreements.length === 0) {
      return;
    }
    const kept: TradeAgreementView[] = [];
    const foodEnabled = !this._config.disableFood();

    for (const agr of this._activeTradeAgreements) {
      if (
        !this.hasPlayer(agr.proposerID) ||
        !this.hasPlayer(agr.partnerID)
      ) {
        continue;
      }
      const proposer = this.player(agr.proposerID);
      const partner = this.player(agr.partnerID);
      // Suspend/cancel immediately on warfare, embargo, or elimination
      if (this.arePlayersAtWarOrHostile(proposer, partner)) {
        this._tradeCooldowns.set(
          this.tradePairKey(agr.proposerID, agr.partnerID),
          this._ticks,
        );
        if (proposer.isAlive()) {
          this.displayMessage(
            "crownfall.trade_war_cancelled",
            MessageType.ALLIANCE_BROKEN,
            proposer.id(),
            undefined,
            { name: partner.displayName() },
          );
        }
        if (partner.isAlive()) {
          this.displayMessage(
            "crownfall.trade_war_cancelled",
            MessageType.ALLIANCE_BROKEN,
            partner.id(),
            undefined,
            { name: proposer.displayName() },
          );
        }
        continue;
      }

      kept.push(agr);

      // Execute automatic 1Hz exchanges
      if (agr.tradeType === TradeAgreementType.ImportFood && foodEnabled) {
        if (
          partner.food() >=
            CROWNFALL_TRADE_CONFIG.minPartnerFoodBufferForExport &&
          proposer.gold() >= CROWNFALL_TRADE_CONFIG.foodPaymentGoldPerSec
        ) {
          const cap = maxFoodStorage(
            completedStructureLevels(proposer, UnitType.Granary),
          );
          partner.addFood(-CROWNFALL_TRADE_CONFIG.foodShipmentPerSec);
          proposer.addFood(CROWNFALL_TRADE_CONFIG.foodShipmentPerSec, cap);
          const paid = proposer.removeGold(
            CROWNFALL_TRADE_CONFIG.foodPaymentGoldPerSec,
          );
          partner.addGold(paid);
        }
      } else if (agr.tradeType === TradeAgreementType.ExportFood && foodEnabled) {
        if (
          proposer.food() >=
            CROWNFALL_TRADE_CONFIG.minPartnerFoodBufferForExport &&
          partner.gold() >= CROWNFALL_TRADE_CONFIG.foodPaymentGoldPerSec
        ) {
          const cap = maxFoodStorage(
            completedStructureLevels(partner, UnitType.Granary),
          );
          proposer.addFood(-CROWNFALL_TRADE_CONFIG.foodShipmentPerSec);
          partner.addFood(CROWNFALL_TRADE_CONFIG.foodShipmentPerSec, cap);
          const paid = partner.removeGold(
            CROWNFALL_TRADE_CONFIG.foodPaymentGoldPerSec,
          );
          proposer.addGold(paid);
        }
      } else if (agr.tradeType === TradeAgreementType.CommercePact) {
        proposer.addGold(CROWNFALL_TRADE_CONFIG.commerceGoldPerSec);
        partner.addGold(CROWNFALL_TRADE_CONFIG.commerceGoldPerSec);
      } else if (agr.tradeType === TradeAgreementType.ResearchPact) {
        proposer.addScience(CROWNFALL_TRADE_CONFIG.researchSciencePerSec);
        partner.addScience(CROWNFALL_TRADE_CONFIG.researchSciencePerSec);
        proposer.addGold(CROWNFALL_TRADE_CONFIG.researchGoldPerSec);
        partner.addGold(CROWNFALL_TRADE_CONFIG.researchGoldPerSec);
      }
    }

    this._activeTradeAgreements = kept;
  }

  activeBountyTargetID(): PlayerID | null {
    if (this._config.disableBounties()) return null;
    return this._activeBountyTargetID;
  }

  private bountyRng(): PseudoRandom {
    const firstPlayerSeed =
      this._playersBySmallID.length > 0
        ? (this._playersBySmallID[0] as PlayerImpl)._pseudo_random.nextInt(
            1,
            2_000_000_000,
          )
        : 1337;
    const mixed =
      (Math.imul(this._ticks + 17, 2654435761) ^
        Math.imul(this._bountiesTriggered + 1, 2246822519) ^
        firstPlayerSeed) >>>
      0;
    return new PseudoRandom(mixed || 1);
  }

  triggerBountyEvent(forcedTarget?: Player): boolean {
    if (
      this._config.disableBounties() ||
      this.inSpawnPhase() ||
      this._activeBountyTargetID !== null
    ) {
      return false;
    }

    let target: Player | null = forcedTarget ?? null;
    if (!target) {
      const aliveCountries = this._playersBySmallID.filter(
        (p) =>
          p.isAlive() &&
          isEligibleBountyTargetType(p.type()) &&
          p.numTilesOwned() >= CROWNFALL_BOUNTY_CONFIG.minEligibleTargetTiles,
      );
      // Need at least 2 active countries on the map so someone can claim the bounty
      if (aliveCountries.length < 2) {
        return false;
      }
      const nonRepeat = aliveCountries.filter(
        (p) => p.id() !== this._lastBountyTargetID,
      );
      const pool = nonRepeat.length > 0 ? nonRepeat : aliveCountries;
      const rng = this.bountyRng();
      target = pool[rng.nextInt(0, pool.length)];
    } else if (!target.isAlive()) {
      return false;
    }

    this._activeBountyTargetID = target.id();
    this._lastBountyTargetID = target.id();
    this._bountiesTriggered++;
    this._bountyExpiresTick =
      this._ticks + CROWNFALL_BOUNTY_CONFIG.bountyDurationTicks;
    this._bountyTilesConquered.clear();

    const durationSec = Math.ceil(
      CROWNFALL_BOUNTY_CONFIG.bountyDurationTicks / 10,
    );

    // Global announcement + dedicated alert to the targeted country
    this.displayMessage(
      "crownfall.bounty_activated",
      MessageType.ATTACK_REQUEST,
      null,
      undefined,
      { name: target.displayName(), sec: `${durationSec}` },
      undefined,
      target.id(),
    );
    this.displayMessage(
      "crownfall.bounty_you_are_target",
      MessageType.ATTACK_FAILED,
      target.id(),
      undefined,
      { sec: `${durationSec}` },
    );

    this.addUpdate({
      type: GameUpdateType.Bounty,
      active: true,
      targetID: target.id(),
      targetSmallID: target.smallID(),
      targetName: target.displayName(),
      secondsRemaining: durationSec,
    });
    return true;
  }

  private tickBountyEvents(): void {
    if (this._config.disableBounties()) return;

    if (this._activeBountyTargetID !== null) {
      if (!this.hasPlayer(this._activeBountyTargetID)) {
        this._activeBountyTargetID = null;
        this._bountyTilesConquered.clear();
        return;
      }
      const target = this.player(this._activeBountyTargetID);
      if (this._ticks >= this._bountyExpiresTick || !target.isAlive()) {
        const survived = target.isAlive();
        const targetName = target.displayName();
        this._activeBountyTargetID = null;
        this._bountyTilesConquered.clear();
        this._nextBountyEligibleTick =
          this._activeGameplayTicks +
          CROWNFALL_BOUNTY_CONFIG.bountyCooldownTicks;

        if (survived) {
          this.displayMessage(
            "crownfall.bounty_expired",
            MessageType.ALLIANCE_EXPIRED,
            null,
            undefined,
            { name: targetName },
          );
        }
        this.addUpdate({
          type: GameUpdateType.Bounty,
          active: false,
          targetID: null,
          targetSmallID: null,
          targetName: "",
          secondsRemaining: 0,
        });
        return;
      }

      const secLeft = Math.max(
        0,
        Math.ceil((this._bountyExpiresTick - this._ticks) / 10),
      );
      this.addUpdate({
        type: GameUpdateType.Bounty,
        active: true,
        targetID: target.id(),
        targetSmallID: target.smallID(),
        targetName: target.displayName(),
        secondsRemaining: secLeft,
      });
      return;
    }

    if (this._activeGameplayTicks >= this._nextBountyEligibleTick) {
      if (!this.triggerBountyEvent()) {
        // Retry in 30s if not enough eligible countries yet
        this._nextBountyEligibleTick = this._activeGameplayTicks + 300;
      }
    }
  }

  private resolveBountyElimination(conqueror: Player, conquered: Player): void {
    if (
      this._config.disableBounties() ||
      this._activeBountyTargetID === null ||
      conquered.id() !== this._activeBountyTargetID
    ) {
      return;
    }

    const isEligibleWinner = (cand: Player): boolean =>
      cand.isAlive() &&
      cand !== conquered &&
      !cand.isOnSameTeam(conquered) &&
      !cand.isAlliedWith(conquered);

    // Determine top tile-conquering contributor during the bounty window
    let topContributor: Player | null = null;
    let topTiles = 0;
    let totalBountyTiles = 0;
    for (const [attackerID, count] of this._bountyTilesConquered) {
      if (!this.hasPlayer(attackerID)) continue;
      const cand = this.player(attackerID);
      if (!isEligibleWinner(cand)) continue;
      totalBountyTiles += count;
      if (count > topTiles) {
        topTiles = count;
        topContributor = cand;
      }
    }

    let winner: Player | null = null;
    const conquerorTiles = this._bountyTilesConquered.get(conqueror.id()) ?? 0;
    if (isEligibleWinner(conqueror)) {
      // Award conqueror if they contributed >= 25% of bounty tiles (or no one else took >2x their tiles)
      if (
        topContributor === null ||
        topContributor === conqueror ||
        (totalBountyTiles > 0 && conquerorTiles * 4 >= totalBountyTiles)
      ) {
        winner = conqueror;
      } else {
        winner = topContributor;
      }
    } else {
      winner = topContributor;
    }

    this._activeBountyTargetID = null;
    this._bountyTilesConquered.clear();
    this._nextBountyEligibleTick =
      this._activeGameplayTicks + CROWNFALL_BOUNTY_CONFIG.bountyCooldownTicks;

    if (!winner) {
      // Self-elimination or friendly exploitation -> no reward granted!
      this.addUpdate({
        type: GameUpdateType.Bounty,
        active: false,
        targetID: null,
        targetSmallID: null,
        targetName: "",
        secondsRemaining: 0,
      });
      return;
    }

    const priorClaims = this._bountyClaimsByPlayer.get(winner.id()) ?? 0;
    this._bountyClaimsByPlayer.set(winner.id(), priorClaims + 1);

    const rng = this.bountyRng();
    const grant = rollScaledBountyReward(
      rng,
      this._activeGameplayTicks,
      winner.numTilesOwned(),
      this.totalLandTiles(),
      this._config.maxTroops(winner),
      priorClaims,
      !this._config.disableFood(),
    );

    if (grant.gold > 0n) {
      winner.addGold(grant.gold);
    }
    if (grant.troops > 0) {
      winner.addTroops(grant.troops);
    }
    if (grant.civilians > 0) {
      winner.addCivilianPopulation(grant.civilians);
    }
    if (grant.food > 0) {
      const cap = maxFoodStorage(
        completedStructureLevels(winner, UnitType.Granary),
      );
      winner.addFood(grant.food, cap);
    }
    if (grant.science > 0) {
      winner.addScience(grant.science);
    }
    if (grant.buffDurationTicks > 0) {
      winner.grantBountyBuff(grant.rewardType, grant.buffDurationTicks);
    }

    this.displayMessage(
      `crownfall.bounty_claimed_${grant.rewardType}`,
      MessageType.CONQUERED_PLAYER,
      null,
      undefined,
      {
        winner: winner.displayName(),
        target: conquered.displayName(),
      },
      undefined,
      winner.id(),
    );

    this.addUpdate({
      type: GameUpdateType.Bounty,
      active: false,
      targetID: null,
      targetSmallID: null,
      targetName: "",
      secondsRemaining: 0,
      claimedByName: winner.displayName(),
      rewardType: grant.rewardType,
    });
  }

  triggerPathDraft(): boolean {
    if (
      this._pathDraftActive ||
      this._pathDraftTriggered ||
      this._augmentDraftActive ||
      this.inSpawnPhase()
    ) {
      return false;
    }
    const eligibleHumans = this._playersBySmallID.filter(
      (p) =>
        p.type() === PlayerType.Human &&
        p.isAlive() &&
        !p.isDisconnected() &&
        p.primaryPath() === null,
    );
    if (eligibleHumans.length === 0) {
      return false;
    }

    this._pathDraftTriggered = true;
    this._pathDraftActive = true;
    this._augmentDraftTicksRemaining =
      this._config.gameConfig().gameType === GameType.Singleplayer
        ? -1
        : MULTIPLAYER_DRAFT_TIMEOUT_TICKS;

    this.addUpdate({
      type: GameUpdateType.AugmentDraft,
      draftKind: "path",
      active: true,
      round: 0,
      totalRounds: MAX_AUGMENTS_PER_PLAYER,
      pickedCount: 0,
      totalCount: eligibleHumans.length,
      ticksRemaining: this._augmentDraftTicksRemaining,
    });
    return true;
  }

  private tickPathDraft(): void {
    if (this.unInitExecs.length > 0) {
      const remaining: Execution[] = [];
      for (const e of this.unInitExecs) {
        if (
          e instanceof SelectDevPathExecution ||
          e instanceof MarkDisconnectedExecution
        ) {
          e.init(this, this._ticks);
          e.tick(this._ticks);
        } else {
          remaining.push(e);
        }
      }
      this.unInitExecs = remaining;
    }

    const activeHumans = this._playersBySmallID.filter(
      (p) =>
        p.type() === PlayerType.Human && p.isAlive() && !p.isDisconnected(),
    );

    if (this._augmentDraftTicksRemaining > 0) {
      this._augmentDraftTicksRemaining--;
      if (this._augmentDraftTicksRemaining === 0) {
        for (const h of activeHumans) {
          if (h.primaryPath() === null) {
            h.setPrimaryPath(DevelopmentPath.Military);
          }
        }
      }
    }

    const totalCount = activeHumans.length;
    const pickedCount = activeHumans.filter(
      (h) => h.primaryPath() !== null,
    ).length;

    if (totalCount === 0 || pickedCount >= totalCount) {
      this._pathDraftActive = false;
      this._augmentDraftTicksRemaining = -1;
      this.addUpdate({
        type: GameUpdateType.AugmentDraft,
        draftKind: "path",
        active: false,
        round: 0,
        totalRounds: MAX_AUGMENTS_PER_PLAYER,
        pickedCount: totalCount,
        totalCount,
        ticksRemaining: 0,
      });
    } else {
      this.addUpdate({
        type: GameUpdateType.AugmentDraft,
        draftKind: "path",
        active: true,
        round: 0,
        totalRounds: MAX_AUGMENTS_PER_PLAYER,
        pickedCount,
        totalCount,
        ticksRemaining: this._augmentDraftTicksRemaining,
      });
    }
  }

  triggerAugmentDraft(): boolean {
    if (
      this._config.disableAugments() ||
      this._augmentDraftActive ||
      this._pathDraftActive ||
      this._augmentRoundsTriggered >= MAX_AUGMENTS_PER_PLAYER ||
      this.inSpawnPhase()
    ) {
      return false;
    }
    const eligibleHumans = this._playersBySmallID.filter(
      (p) =>
        p.type() === PlayerType.Human &&
        p.isAlive() &&
        !p.isDisconnected() &&
        p.selectedAugments().length < MAX_AUGMENTS_PER_PLAYER,
    );
    if (eligibleHumans.length === 0) {
      return false;
    }

    for (const human of eligibleHumans) {
      const impl = human as PlayerImpl;
      const choices = rollAugmentChoices(
        impl._pseudo_random,
        impl.selectedAugments(),
      );
      impl.offerAugmentChoices(choices);
    }

    this._augmentRoundsTriggered++;
    this._augmentDraftActive = true;
    this._augmentDraftTicksRemaining =
      this._config.gameConfig().gameType === GameType.Singleplayer
        ? -1
        : MULTIPLAYER_DRAFT_TIMEOUT_TICKS;

    this.addUpdate({
      type: GameUpdateType.AugmentDraft,
      draftKind: "augment",
      active: true,
      round: this._augmentRoundsTriggered,
      totalRounds: MAX_AUGMENTS_PER_PLAYER,
      pickedCount: 0,
      totalCount: eligibleHumans.length,
      ticksRemaining: this._augmentDraftTicksRemaining,
    });
    return true;
  }

  private tickAugmentDraft(): void {
    // Only allow augment selections & disconnect markers while paused in draft
    if (this.unInitExecs.length > 0) {
      const remaining: Execution[] = [];
      for (const e of this.unInitExecs) {
        if (
          e instanceof SelectAugmentExecution ||
          e instanceof MarkDisconnectedExecution
        ) {
          e.init(this, this._ticks);
          e.tick(this._ticks);
        } else {
          remaining.push(e);
        }
      }
      this.unInitExecs = remaining;
    }

    const activeHumans = this._playersBySmallID.filter(
      (p) =>
        p.type() === PlayerType.Human && p.isAlive() && !p.isDisconnected(),
    );

    if (this._augmentDraftTicksRemaining > 0) {
      this._augmentDraftTicksRemaining--;
      if (this._augmentDraftTicksRemaining === 0) {
        // Deterministic auto-pick on multiplayer timeout so AFK players never stall the match
        for (const h of activeHumans) {
          const pending = h.pendingAugmentChoices();
          if (pending.length > 0) {
            h.selectAugment(pending[0]);
          }
        }
      }
    }

    const totalCount = activeHumans.length;
    const pickedCount = activeHumans.filter(
      (h) => h.pendingAugmentChoices().length === 0,
    ).length;

    if (totalCount === 0 || pickedCount >= totalCount) {
      // Clear any leftover pending choices on dead/disconnected players
      for (const p of this._playersBySmallID) {
        if (p.pendingAugmentChoices().length > 0) {
          p.offerAugmentChoices([]);
        }
      }
      this._augmentDraftActive = false;
      this._augmentDraftTicksRemaining = -1;
      this.addUpdate({
        type: GameUpdateType.AugmentDraft,
        draftKind: "augment",
        active: false,
        round: this._augmentRoundsTriggered,
        totalRounds: MAX_AUGMENTS_PER_PLAYER,
        pickedCount: totalCount,
        totalCount,
        ticksRemaining: 0,
      });
    } else {
      this.addUpdate({
        type: GameUpdateType.AugmentDraft,
        draftKind: "augment",
        active: true,
        round: this._augmentRoundsTriggered,
        totalRounds: MAX_AUGMENTS_PER_PLAYER,
        pickedCount,
        totalCount,
        ticksRemaining: this._augmentDraftTicksRemaining,
      });
    }
  }

  inSpawnPhase(): boolean {
    return this.startTick === null;
  }

  endSpawnPhase(): void {
    if (this.startTick !== null) {
      return;
    }
    this.startTick = this._ticks;
    this.addUpdate({
      type: GameUpdateType.SpawnPhaseEnd,
      startTick: this.startTick,
    });
  }

  /**
   * Queues, with the next tick's updates, what a view with no history needs
   * to show this game as it stands: a host showing a game restored from a
   * snapshot never saw the updates that built it. Players need nothing here,
   * since a restored player's first update is a full one.
   */
  queueViewResync(): void {
    this.viewResyncQueued = true;
  }

  private addViewResync(): void {
    const map = this._map as GameMapImpl;
    const numTiles = map.width() * map.height();
    for (let tile = 0; tile < numTiles; tile++) {
      if (map.tileState(tile) !== 0 || map.isTerrainEdited(tile)) {
        this.recordTileUpdate(tile);
      }
    }
    // The view never got the motion plans of moves already under way, so
    // those units report each step instead, as unplanned units do.
    this.planDrivenUnitIds.clear();
    for (const unit of this._unitMap.values()) {
      this.addUpdate(unit.toUpdate());
    }
    const railroads = new Set<Railroad>();
    for (const station of this._railNetwork.stationManager().getAll()) {
      for (const railroad of station.getRailroads()) railroads.add(railroad);
    }
    for (const railroad of railroads) {
      this.addUpdate({
        type: GameUpdateType.RailroadConstructionEvent,
        id: railroad.id,
        tiles: railroad.tiles,
      });
    }
    if (this.startTick !== null) {
      this.addUpdate({
        type: GameUpdateType.SpawnPhaseEnd,
        startTick: this.startTick,
      });
    }
  }

  ticks(): number {
    return this._ticks;
  }

  executeNextTick(): GameUpdates {
    this.updates = createGameUpdatesMap();
    this.tileUpdatePairs.length = 0;
    if (this.viewResyncQueued) {
      this.viewResyncQueued = false;
      this.addViewResync();
    }
    if (this._pathDraftActive) {
      this.tickPathDraft();
    } else if (this._augmentDraftActive) {
      this.tickAugmentDraft();
    } else {
      this.execs.forEach((e) => {
        if (
          (!this.inSpawnPhase() || e.activeDuringSpawnPhase()) &&
          e.isActive()
        ) {
          e.tick(this._ticks);
        }
      });
      if (this.unInitExecs.length > 0) {
        const inited: Execution[] = [];
        const unInited: Execution[] = [];
        for (const e of this.unInitExecs) {
          if (!this.inSpawnPhase() || e.activeDuringSpawnPhase()) {
            e.init(this, this._ticks);
            inited.push(e);
          } else {
            unInited.push(e);
          }
        }
        this.execs.push(...inited);
        this.unInitExecs = unInited;
      }

      this.removeInactiveExecutions();

      if (!this.inSpawnPhase() && !this._config.gameConfig().tutorial) {
        if (this._ticks % 10 === 0) {
          this.tickTradeAgreements();
          this.tickBountyEvents();
        }
        if (
          this._ticks % 10 === 0 &&
          this._pendingAllianceActions.length > 0
        ) {
          const stillPending: typeof this._pendingAllianceActions = [];
          for (const r of this._pendingAllianceActions) {
            if (r.expiresAt > this._ticks) {
              stillPending.push(r);
            } else if (
              this.hasPlayer(r.requestorID) &&
              this.hasPlayer(r.recipientID)
            ) {
              this.addUpdate({
                type: GameUpdateType.AllianceActionReply,
                requestID: r.id,
                requestorID: this.player(r.requestorID).smallID(),
                recipientID: this.player(r.recipientID).smallID(),
                actionType: r.actionType,
                accepted: false,
                targetID:
                  r.targetID !== null && this.hasPlayer(r.targetID)
                    ? this.player(r.targetID).smallID()
                    : null,
                reason: "expired",
              });
            }
          }
          this._pendingAllianceActions = stillPending;
        }
        if (
          !this._pathDraftTriggered &&
          this._config.enableOpeningPathDraft() &&
          this._activeGameplayTicks === 0
        ) {
          this.triggerPathDraft();
        }
        if (!this._pathDraftActive) {
          this._activeGameplayTicks++;
          if (
            !this._config.disableAugments() &&
            this._augmentRoundsTriggered < AUGMENT_ROUND_TICKS.length &&
            this._activeGameplayTicks >=
              AUGMENT_ROUND_TICKS[this._augmentRoundsTriggered]
          ) {
            this.triggerAugmentDraft();
          }
        }
      }
    }

    for (const player of this._playersBySmallID) {
      // Sampled before toUpdate so the reading is of the tick that just ran.
      // Dead and unspawned players are skipped: an eliminated player's fall
      // to zero tiles would otherwise register as a total collapse.
      if (player.isAlive() && player.hasSpawned()) {
        this.stats().recordTickSample(
          player,
          player.numTilesOwned(),
          player.troops(),
          player.alliances().length,
        );
      }
      const update = player.toUpdate(
        this.playerStatsQuads,
        this.attackTroopsQuads,
      );
      if (update !== null) this.addUpdate(update);
    }
    if (this.ticks() % 10 === 0) {
      this.addUpdate({
        type: GameUpdateType.Hash,
        tick: this.ticks(),
        hash: this.hash(),
      });
    }
    // Flush pending water conversions + throttled graph rebuild
    const waterChangedTiles = this._waterManager.tick(this._ticks);
    for (const tile of waterChangedTiles) {
      this.recordTileUpdate(tile);
    }
    // Queued conversions write the map directly, bypassing setWater.
    if (waterChangedTiles.length > 0) this._structureVersion++;
    this._ticks++;
    return this.updates;
  }

  private recordTileUpdate(tile: TileRef): void {
    // Low 16 bits: tile state, bits 16-23: terrain byte
    this.tileUpdatePairs.push(
      tile,
      (this._map.tileState(tile) & 0xffff) |
        (this._map.terrainByte(tile) << 16),
    );
  }

  drainPackedTileUpdates(): Uint32Array {
    const pairs = this.tileUpdatePairs;
    const packed = new Uint32Array(pairs.length);
    for (let i = 0; i < pairs.length; i++) {
      packed[i] = pairs[i];
    }
    pairs.length = 0;
    return packed;
  }

  drainPackedPlayerUpdates(): Float64Array | null {
    const quads = this.playerStatsQuads;
    if (quads.length === 0) return null;
    const packed = Float64Array.from(quads);
    quads.length = 0;
    return packed;
  }

  drainPackedAttackUpdates(): Float64Array | null {
    const quads = this.attackTroopsQuads;
    if (quads.length === 0) return null;
    const packed = Float64Array.from(quads);
    quads.length = 0;
    return packed;
  }

  recordMotionPlan(record: MotionPlanRecord): void {
    switch (record.kind) {
      case "grid":
        this.planDrivenUnitIds.add(record.unitId);
        break;
      case "train":
        this.planDrivenUnitIds.add(record.engineUnitId);
        for (const unitId of record.carUnitIds) {
          this.planDrivenUnitIds.add(unitId);
        }
        break;
    }
    this.motionPlanRecords.push(record);
  }

  private isUnitPlanDriven(unitId: number): boolean {
    return this.planDrivenUnitIds.has(unitId);
  }

  maybeAddUnitUpdate(unit: Unit): void {
    if (!this.isUnitPlanDriven(unit.id())) {
      this.addUpdate(unit.toUpdate());
    }
  }

  onUnitMoved(unit: Unit): void {
    this.updateUnitTile(unit);
    this.maybeAddUnitUpdate(unit);
  }

  drainPackedMotionPlans(): Uint32Array | null {
    const records = this.motionPlanRecords;
    if (records.length === 0) {
      return null;
    }
    const packed = packMotionPlans(records);
    records.length = 0;
    return packed;
  }

  private hash(): number {
    let hash = 1;
    this._players.forEach((p) => {
      hash += p.hash();
    });
    // Rails are not units, so without this a divergence in which rails got
    // built would only show up through the trains that later run on them.
    hash += this._railNetwork.hash();
    return hash;
  }

  terraNullius(): TerraNullius {
    return this._terraNullius;
  }

  removeInactiveExecutions(): void {
    // Compact in place to avoid reallocating the (large) executions array
    // every tick.
    const execs = this.execs;
    const inSpawnPhase = this.inSpawnPhase();
    let w = 0;
    for (let i = 0; i < execs.length; i++) {
      const exec = execs[i];
      const keep = inSpawnPhase
        ? !exec.activeDuringSpawnPhase() || exec.isActive()
        : exec.isActive();
      if (keep) {
        execs[w++] = exec;
      }
    }
    execs.length = w;
  }

  players(): Player[] {
    return this._playersBySmallID.filter((p) => p.isAlive());
  }

  allPlayers(): Player[] {
    return this._playersBySmallID.slice();
  }

  executions(): Execution[] {
    return [...this.execs, ...this.unInitExecs];
  }

  addExecution(...exec: Execution[]) {
    this.unInitExecs.push(...exec);
  }

  removeExecution(exec: Execution) {
    this.execs = this.execs.filter((execution) => execution !== exec);
    this.unInitExecs = this.unInitExecs.filter(
      (execution) => execution !== exec,
    );
  }

  takeoverPlayer(player: Player | PlayerID, localClientID: ClientID): void {
    const target = typeof player === "string" ? this.player(player) : player;

    const oldClientID = target.clientID();
    if (oldClientID !== null) {
      this._stats.migrateClientID(oldClientID, localClientID);
    }

    // Remove any NationExecution or TribeExecution controlling this player
    for (const exec of this.executions()) {
      if (
        (exec instanceof NationExecution || exec instanceof TribeExecution) &&
        exec.playerID() === target.id()
      ) {
        this.removeExecution(exec);
      }
    }

    // Update chosen player to be the local human
    const chosenInfo = target.info();
    const updatedChosenInfo = new PlayerInfo(
      chosenInfo.name,
      PlayerType.Human,
      localClientID,
      chosenInfo.id,
      chosenInfo.isLobbyCreator,
      chosenInfo.clanTag,
      chosenInfo.friends,
      chosenInfo.teamIndex,
      chosenInfo.nationFlag,
    );
    target.setPlayerInfo(updatedChosenInfo);
    target.markDisconnected(false);

    this._humans = this._humans.filter((h) => h.id !== target.id());
    this._humans.push(updatedChosenInfo);
    this._nations = this._nations.filter(
      (n) => n.playerInfo.id !== target.id(),
    );
  }

  clearHumanPlayer(player: Player | PlayerID): void {
    const target = typeof player === "string" ? this.player(player) : player;
    const pInfo = target.info();
    const updatedBotInfo = new PlayerInfo(
      pInfo.name,
      PlayerType.Nation,
      null,
      pInfo.id,
      false,
      pInfo.clanTag,
      pInfo.friends,
      pInfo.teamIndex,
      pInfo.nationFlag,
    );
    target.setPlayerInfo(updatedBotInfo);
    target.markDisconnected(false);

    this._humans = this._humans.filter((h) => h.id !== target.id());
  }

  clearOtherHumans(keptPlayer: Player | PlayerID): void {
    const target =
      typeof keptPlayer === "string" ? this.player(keptPlayer) : keptPlayer;
    this._humans = this._humans.filter((h) => h.id === target.id());
  }

  convertHumanToNation(player: Player | PlayerID, gameID: GameID): Execution {
    const target = typeof player === "string" ? this.player(player) : player;
    this.clearHumanPlayer(target);

    this._nations = this._nations.filter(
      (n) => n.playerInfo.id !== target.id(),
    );
    const spawnTile = target.spawnTile();
    const spawnCell =
      spawnTile !== undefined ? this.cell(spawnTile) : undefined;
    const nation = new Nation(spawnCell, target.info());
    this._nations.push(nation);

    const nationExec = new NationExecution(gameID, nation);
    this.addExecution(nationExec);
    return nationExec;
  }

  applySingleplayerConfig(difficulty?: Difficulty): void {
    this.config().setGameType(GameType.Singleplayer);
    if (difficulty !== undefined) {
      this.config().setDifficulty(difficulty);
    }
    for (const exec of this.executions()) {
      if (exec instanceof SpawnTimerExecution) {
        this.removeExecution(exec);
      } else if (
        difficulty !== undefined &&
        exec instanceof NationExecution &&
        exec.isActive() &&
        exec.isInitialized()
      ) {
        exec.refreshDifficulty();
      }
    }
  }

  playerView(id: PlayerID): Player {
    return this.player(id);
  }

  addPlayer(playerInfo: PlayerInfo, team: Team | null = null): Player {
    const player = new PlayerImpl(
      this,
      this.nextPlayerID,
      playerInfo,
      this.config().startManpower(playerInfo),
      team ?? this.maybeAssignTeam(playerInfo),
    );
    this._playersBySmallID.push(player);
    this.nextPlayerID++;
    this._players.set(playerInfo.id, player);
    return player;
  }

  private maybeAssignTeam(player: PlayerInfo): Team | null {
    if (this._config.gameConfig().gameMode !== GameMode.Team) {
      return null;
    }
    if (player.playerType === PlayerType.Bot) {
      return this.botTeam;
    }
    const rand = simpleHash(player.id);
    return this.playerTeams[rand % this.playerTeams.length];
  }

  player(id: PlayerID): Player {
    const player = this._players.get(id);
    if (player === undefined) {
      throw new Error(`Player with id ${id} not found`);
    }
    return player;
  }

  playerByClientID(id: ClientID): Player | null {
    for (const [, player] of this._players) {
      if (player.clientID() === id) {
        return player;
      }
    }
    return null;
  }

  isOnMap(cell: Cell): boolean {
    return (
      cell.x >= 0 &&
      cell.x < this._width &&
      cell.y >= 0 &&
      cell.y < this._height
    );
  }

  neighborsWithDiag(tile: TileRef): TileRef[] {
    const x = this.x(tile);
    const y = this.y(tile);
    const ns: TileRef[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue; // Skip the center tile
        const newX = x + dx;
        const newY = y + dy;
        if (
          newX >= 0 &&
          newX < this._width &&
          newY >= 0 &&
          newY < this._height
        ) {
          ns.push(this._map.ref(newX, newY));
        }
      }
    }
    return ns;
  }

  // Zero-allocation neighbor iteration for performance-critical code
  forEachNeighborWithDiag(
    tile: TileRef,
    callback: (neighbor: TileRef) => void,
  ): void {
    this._map.forEachNeighborWithDiag(tile, callback);
  }

  conquer(owner: PlayerImpl, tile: TileRef): void {
    if (!this.isLand(tile)) {
      throw Error(`cannot conquer water`);
    }
    if (this.isImpassable(tile)) {
      throw Error(`cannot conquer impassable terrain`);
    }
    const previousOwner = this.owner(tile) as TerraNullius | PlayerImpl;
    if (previousOwner.isPlayer()) {
      previousOwner._lastTileChange = this._ticks;
      previousOwner._tileChangeVersion++;
      previousOwner._tiles.delete(tile);
      previousOwner._borderTiles.delete(tile);
      if (previousOwner._unintegratedTiles > previousOwner._tiles.size) {
        previousOwner._unintegratedTiles = previousOwner._tiles.size;
      }
      if (
        this._activeBountyTargetID !== null &&
        previousOwner.id() === this._activeBountyTargetID &&
        owner !== previousOwner &&
        !owner.isOnSameTeam(previousOwner) &&
        !owner.isAlliedWith(previousOwner)
      ) {
        this._bountyTilesConquered.set(
          owner.id(),
          (this._bountyTilesConquered.get(owner.id()) ?? 0) + 1,
        );
      }
    }
    this._territoryVersion++;
    this._map.setOwnerID(tile, owner.smallID());
    owner._tiles.add(tile);
    if (
      !this.inSpawnPhase() &&
      !this._config.gameConfig().tutorial &&
      owner.type() !== PlayerType.Bot &&
      previousOwner !== owner &&
      (previousOwner.isPlayer()
        ? this._activeGameplayTicks > 0
        : this._activeGameplayTicks > 50)
    ) {
      owner.addUnintegratedTiles(1);
    }
    owner._lastTileChange = this._ticks;
    owner._tileChangeVersion++;
    this.updateBorders(tile);
    this._map.setFallout(tile, false);
    this.recordTileUpdate(tile);
  }

  relinquish(tile: TileRef) {
    if (!this.hasOwner(tile)) {
      throw new Error(`Cannot relinquish tile because it is unowned`);
    }
    if (this.isWater(tile)) {
      throw new Error("Cannot relinquish water");
    }

    const previousOwner = this.owner(tile) as PlayerImpl;
    previousOwner._lastTileChange = this._ticks;
    previousOwner._tileChangeVersion++;
    previousOwner._tiles.delete(tile);
    previousOwner._borderTiles.delete(tile);
    if (previousOwner._unintegratedTiles > previousOwner._tiles.size) {
      previousOwner._unintegratedTiles = previousOwner._tiles.size;
    }

    this._territoryVersion++;
    this._map.setOwnerID(tile, 0);
    this.updateBorders(tile);
    this.recordTileUpdate(tile);
  }

  // Reusable neighbor buffer to avoid closures/allocation in updateBorders.
  private borderNbuf: TileRef[] = [0, 0, 0, 0];

  private updateBorders(tile: TileRef) {
    this.updateBorderStatus(tile);
    const numNeighbors = this._map.neighbors4(tile, this.borderNbuf);
    for (let i = 0; i < numNeighbors; i++) {
      this.updateBorderStatus(this.borderNbuf[i]);
    }
  }

  private updateBorderStatus(t: TileRef): void {
    if (!this._map.hasOwner(t)) {
      return;
    }
    const owner = this.owner(t) as PlayerImpl;
    if (this._map.isBorder(t)) {
      owner._borderTiles.add(t);
    } else {
      owner._borderTiles.delete(t);
    }
  }

  target(targeter: Player, target: Player) {
    this.addUpdate({
      type: GameUpdateType.TargetPlayer,
      playerID: targeter.smallID(),
      targetID: target.smallID(),
    });
  }

  public breakAlliance(breaker: Player, alliance: MutableAlliance) {
    let other: Player;
    if (alliance.requestor() === breaker) {
      other = alliance.recipient();
    } else {
      other = alliance.requestor();
    }
    if (!breaker.isAlliedWith(other)) {
      throw new Error(
        `${breaker} not allied with ${other}, cannot break alliance`,
      );
    }
    const duration = this._ticks - alliance.createdAt();
    if (!other.isTraitor() && !other.isDisconnected()) {
      breaker.markTraitor();
      // Only a real betrayal counts as being betrayed. Gated on the same
      // condition as markTraitor so that a teammate dropping their connection
      // is not recorded as having stabbed anyone in the back.
      this.stats().allianceEnded(other, duration, "brokenByOther");
    } else {
      this.stats().allianceEnded(other, duration, null);
    }
    // The breaker's side is already counted by betray(); this call is only
    // here so their longest-held maximum still sees this alliance.
    this.stats().allianceEnded(breaker, duration, null);

    this.detachAlliance(alliance);

    this.addUpdate({
      type: GameUpdateType.BrokeAlliance,
      traitorID: breaker.smallID(),
      betrayedID: other.smallID(),
      allianceID: alliance.id(),
    });
  }

  public expireAlliance(alliance: Alliance) {
    const p1Set = new Set(alliance.recipient().alliances());
    const alliances = alliance
      .requestor()
      .alliances()
      .filter((a) => p1Set.has(a));
    if (alliances.length !== 1) {
      throw new Error(
        `cannot expire alliance: must have exactly one alliance, have ${alliances.length}`,
      );
    }
    const expiring = alliances[0];
    const duration = this._ticks - expiring.createdAt();
    this.stats().allianceEnded(expiring.requestor(), duration, "expired");
    this.stats().allianceEnded(expiring.recipient(), duration, "expired");
    this.detachAlliance(expiring);
    this.addUpdate({
      type: GameUpdateType.AllianceExpired,
      player1ID: alliance.requestor().smallID(),
      player2ID: alliance.recipient().smallID(),
    });
  }

  public removeAlliancesByPlayerSilently(player: Player): void {
    // Snapshot — detachAlliance reassigns the player's _alliances as it goes.
    const removed = [...(player as PlayerImpl)._alliances];
    for (const alliance of removed) {
      // Elimination is the fourth way an alliance ends, and in practice the
      // commonest. Nobody betrayed and nothing expired, so no counter moves;
      // the null counter is here purely so both sides' longest-held maximum
      // still sees the alliance. Without this the survivor's longest held
      // would silently read 0 from an alliance that ran the whole game, and
      // recordAlliancesAtEnd cannot pick it up either — by then it is
      // already detached.
      const duration = this._ticks - alliance.createdAt();
      this.stats().allianceEnded(alliance.requestor(), duration, null);
      this.stats().allianceEnded(alliance.recipient(), duration, null);
      this.detachAlliance(alliance);
    }
  }

  /** Remove an alliance from both participants' per-player alliance lists. */
  private detachAlliance(alliance: Alliance): void {
    const requestor = alliance.requestor() as PlayerImpl;
    const recipient = alliance.recipient() as PlayerImpl;
    requestor._alliances = requestor._alliances.filter((a) => a !== alliance);
    recipient._alliances = recipient._alliances.filter((a) => a !== alliance);
  }

  public isSpawnImmunityActive(): boolean {
    return (
      this.inSpawnPhase() ||
      this.ticksSinceStart() < this.config().spawnImmunityDuration()
    );
  }

  public elapsedGameSeconds(): number {
    return this.ticksSinceStart() / 10;
  }

  public isNationSpawnImmunityActive(): boolean {
    return (
      this.inSpawnPhase() ||
      this.ticksSinceStart() < this.config().nationSpawnImmunityDuration()
    );
  }

  private ticksSinceStart(): number {
    if (this.inSpawnPhase()) {
      return 0;
    }

    return Math.max(0, this.ticks() - this.startTick!);
  }

  sendEmojiUpdate(msg: EmojiMessage): void {
    this.addUpdate({
      type: GameUpdateType.Emoji,
      emoji: msg,
    });
  }

  setWinner(
    winner: Player | Team | null,
    allPlayersStats: AllPlayersStats,
  ): void {
    this._winner = winner;
    // OFM: snapshot final tiles for standings (bots skipped in recordFinalTiles).
    for (const player of this.players()) {
      this.stats().recordFinalTiles(player, player.numTilesOwned());
      const standing = player.alliances();
      let longest = 0;
      for (const a of standing) {
        const held = this._ticks - a.createdAt();
        if (held > longest) longest = held;
      }
      this.stats().recordAlliancesAtEnd(player, standing.length, longest);
    }
    this.addUpdate({
      type: GameUpdateType.Win,
      winner: winner === null ? undefined : this.makeWinner(winner),
      allPlayersStats,
    });
  }

  getWinner(): Player | Team | null {
    return this._winner;
  }

  private isEligibleForTeamWin(
    p: Player,
    team: string,
    threshold: number,
  ): boolean {
    if (p.team() !== team || p.clientID() === null || !p.hasSpawned()) {
      return false;
    }
    if (!p.isDisconnected()) return true;
    const snap = p.disconnectSnapshot();
    if (!snap || !snap.wasAlive) return true;
    return (
      snap.totalLand > 0 && 10 * snap.teamTiles >= threshold * snap.totalLand
    );
  }

  makeWinner(winner: string | Player): Winner | undefined {
    if (typeof winner === "string") {
      const threshold = this._config.teamLandShareWinThresholdTenths();
      return [
        "team",
        winner,
        ...this.allPlayers()
          .filter((p) => this.isEligibleForTeamWin(p, winner, threshold))
          .map((p) => p.clientID()!),
      ];
    }
    const clientId = winner.clientID();
    return clientId === null ? ["nation", winner.name()] : ["player", clientId];
  }

  teams(): Team[] {
    if (this._config.gameConfig().gameMode !== GameMode.Team) {
      return [];
    }
    return [this.botTeam, ...this.playerTeams];
  }

  teamTilesOwned(team: Team): number {
    let teamTiles = 0;
    for (const p of this.allPlayers()) {
      if (p.team() === team) teamTiles += p.numTilesOwned();
    }
    return teamTiles;
  }

  totalLandTiles(): number {
    return Math.max(0, this.numLandTiles() - this.numTilesWithFallout());
  }

  teamSpawnArea(team: Team): SpawnArea | undefined {
    if (!this._teamGameSpawnAreas) {
      return undefined;
    }
    const numTeams = this.playerTeams.length;
    const areas = this._teamGameSpawnAreas[String(numTeams)];
    if (!areas) {
      return undefined;
    }
    const teamIndex = this.playerTeams.indexOf(team);
    if (teamIndex < 0 || teamIndex >= areas.length) {
      return undefined;
    }
    return areas[teamIndex];
  }

  displayMessage(
    message: string,
    type: MessageType,
    playerID: PlayerID | null,
    goldAmount?: bigint,
    params?: Record<string, string | number>,
    unitID?: number,
    focusPlayerID?: PlayerID,
  ): void {
    let id: number | null = null;
    if (playerID !== null) {
      id = this.player(playerID).smallID();
    }
    const focusID =
      focusPlayerID !== undefined
        ? this.player(focusPlayerID).smallID()
        : undefined;
    this.addUpdate({
      type: GameUpdateType.DisplayEvent,
      messageType: type,
      message: message,
      playerID: id,
      goldAmount: goldAmount,
      params: params,
      unitID: unitID,
      focusPlayerID: focusID,
    });
  }

  displayChat(
    message: string,
    category: string,
    target: PlayerID | undefined,
    playerID: PlayerID | null,
    isFrom: boolean,
    recipient: string,
  ): void {
    let id: number | null = null;
    if (playerID !== null) {
      id = this.player(playerID).smallID();
    }
    this.addUpdate({
      type: GameUpdateType.DisplayChatEvent,
      key: message,
      category: category,
      target: target,
      playerID: id,
      isFrom,
      recipient: recipient,
    });
  }

  displayIncomingUnit(
    unitID: number,
    message: string,
    type: MessageType,
    playerID: PlayerID | null,
  ): void {
    if (playerID === null) return;
    const id = this.player(playerID).smallID();

    this.addUpdate({
      type: GameUpdateType.UnitIncoming,
      unitID: unitID,
      message: message,
      messageType: type,
      playerID: id,
    });
  }

  // Bumped whenever any player's unit list changes (build, delete, capture);
  // keys the units(type) memo below.
  private _unitsVersion = 0;
  private readonly unitsByTypeMemo = new Map<
    UnitType,
    { version: number; units: Unit[] }
  >();
  bumpUnitsVersion(): void {
    this._unitsVersion++;
  }

  // Bumped when a City, Port or Factory is added or removed (the structures
  // the rail network connects) and when land turns to water (rail paths route
  // around it), so rail previews can be memoised while the trains, shells and
  // boats that churn _unitsVersion come and go.
  private _structureVersion = 0;
  structureVersion(): number {
    return this._structureVersion;
  }
  /** Call when a unit the rail network cares about appears, vanishes or changes visibility. */
  noteStructureChange(u: Unit): void {
    const type = u.type();
    if (
      type === UnitType.City ||
      type === UnitType.Port ||
      type === UnitType.Factory
    ) {
      this._structureVersion++;
    }
  }

  // Bumped on every change of tile ownership, fallout or land/water — i.e.
  // anything Player.nearby() can observe — so per-player answers can be memoised
  // for as long as nothing on the map moved.
  private _territoryVersion = 0;
  territoryVersion(): number {
    return this._territoryVersion;
  }

  addUnit(u: Unit) {
    this._unitsVersion++;
    this.noteStructureChange(u);
    this.unitGrid.addUnit(u);
    this._unitMap.set(u.id(), u);
  }
  removeUnit(u: Unit) {
    this._unitsVersion++;
    this.noteStructureChange(u);
    this.unitGrid.removeUnit(u);
    this._unitMap.delete(u.id());
    this.planDrivenUnitIds.delete(u.id());
    if (u.hasTrainStation()) {
      this._railNetwork.removeStation(u);
    }
  }
  updateUnitTile(u: Unit) {
    this.unitGrid.updateUnitCell(u);
  }

  hasUnitNearby(
    tile: TileRef,
    searchRange: number,
    type: UnitType,
    playerId?: PlayerID,
    includeUnderConstruction?: boolean,
  ) {
    return this.unitGrid.hasUnitNearby(
      tile,
      searchRange,
      type,
      playerId,
      includeUnderConstruction,
    );
  }

  anyUnitNearby(
    tile: TileRef,
    searchRange: number,
    types: readonly UnitType[],
    predicate: (unit: Unit) => boolean,
    playerId?: PlayerID,
    includeUnderConstruction?: boolean,
  ): boolean {
    return this.unitGrid.anyUnitNearby(
      tile,
      searchRange,
      types,
      predicate,
      playerId,
      includeUnderConstruction,
    );
  }

  nearbyUnits(
    tile: TileRef,
    searchRange: number,
    types: UnitType | readonly UnitType[],
    predicate?: UnitPredicate,
    includeUnderConstruction?: boolean,
  ): Array<{ unit: Unit; distSquared: number }> {
    return this.unitGrid.nearbyUnits(
      tile,
      searchRange,
      types,
      predicate,
      includeUnderConstruction,
    ) as Array<{
      unit: Unit;
      distSquared: number;
    }>;
  }

  ref(x: number, y: number): TileRef {
    return this._map.ref(x, y);
  }
  isValidRef(ref: TileRef): boolean {
    return this._map.isValidRef(ref);
  }
  x(ref: TileRef): number {
    return this._map.x(ref);
  }
  y(ref: TileRef): number {
    return this._map.y(ref);
  }
  cell(ref: TileRef): Cell {
    return this._map.cell(ref);
  }
  width(): number {
    return this._map.width();
  }
  height(): number {
    return this._map.height();
  }
  numLandTiles(): number {
    return this._map.numLandTiles();
  }
  waterVersion(): number {
    return this._map.waterVersion();
  }
  isValidCoord(x: number, y: number): boolean {
    return this._map.isValidCoord(x, y);
  }
  isLand(ref: TileRef): boolean {
    return this._map.isLand(ref);
  }
  isImpassable(ref: TileRef): boolean {
    return this._map.isImpassable(ref);
  }
  isOceanShore(ref: TileRef): boolean {
    return this._map.isOceanShore(ref);
  }
  isOcean(ref: TileRef): boolean {
    return this._map.isOcean(ref);
  }
  isShoreline(ref: TileRef): boolean {
    return this._map.isShoreline(ref);
  }
  magnitude(ref: TileRef): number {
    return this._map.magnitude(ref);
  }
  terrainByte(ref: TileRef): number {
    return this._map.terrainByte(ref);
  }
  setShorelineBit(ref: TileRef): void {
    this._map.setShorelineBit(ref);
  }
  clearShorelineBit(ref: TileRef): void {
    this._map.clearShorelineBit(ref);
  }
  setOcean(ref: TileRef): void {
    this._map.setOcean(ref);
  }
  setMagnitude(ref: TileRef, value: number): void {
    this._map.setMagnitude(ref, value);
  }
  ownerID(ref: TileRef): number {
    return this._map.ownerID(ref);
  }
  hasOwner(ref: TileRef): boolean {
    return this._map.hasOwner(ref);
  }
  setOwnerID(ref: TileRef, playerId: number): void {
    this._territoryVersion++;
    return this._map.setOwnerID(ref, playerId);
  }
  hasFallout(ref: TileRef): boolean {
    return this._map.hasFallout(ref);
  }
  isBorder(ref: TileRef): boolean {
    return this._map.isBorder(ref);
  }
  neighbors(ref: TileRef): TileRef[] {
    return this._map.neighbors(ref);
  }
  // Zero-allocation neighbor iteration (cardinal only)
  forEachNeighbor(tile: TileRef, callback: (neighbor: TileRef) => void): void {
    this._map.forEachNeighbor(tile, callback);
  }
  neighbors4(ref: TileRef, out: TileRef[]): number {
    return this._map.neighbors4(ref, out);
  }
  neighbors8(ref: TileRef, out: TileRef[]): number {
    return this._map.neighbors8(ref, out);
  }
  isWater(ref: TileRef): boolean {
    return this._map.isWater(ref);
  }
  isShore(ref: TileRef): boolean {
    return this._map.isShore(ref);
  }
  cost(ref: TileRef): number {
    return this._map.cost(ref);
  }
  terrainType(ref: TileRef): TerrainType {
    return this._map.terrainType(ref);
  }
  forEachTile(fn: (tile: TileRef) => void): void {
    return this._map.forEachTile(fn);
  }
  manhattanDist(c1: TileRef, c2: TileRef): number {
    return this._map.manhattanDist(c1, c2);
  }
  euclideanDistSquared(c1: TileRef, c2: TileRef): number {
    return this._map.euclideanDistSquared(c1, c2);
  }
  circleSearch(
    tile: TileRef,
    radius: number,
    filter?: (tile: TileRef, d2: number) => boolean,
  ): Set<TileRef> {
    return this._map.circleSearch(tile, radius, filter);
  }
  bfsSearch(
    tile: TileRef,
    filter: (gm: GameMap, tile: TileRef) => boolean,
    onVisit?: (tile: TileRef) => boolean | void,
  ): boolean {
    return this._map.bfsSearch(tile, filter, onVisit);
  }
  bfs(
    tile: TileRef,
    filter: (gm: GameMap, tile: TileRef) => boolean,
  ): ReadonlyTileSet {
    return this._map.bfs(tile, filter);
  }
  tileState(tile: TileRef): number {
    return this._map.tileState(tile);
  }
  tileStateBuffer(): Uint16Array {
    return this._map.tileStateBuffer();
  }
  updateTile(tile: TileRef, state: number): boolean {
    return this._map.updateTile(tile, state);
  }
  numTilesWithFallout(): number {
    return this._map.numTilesWithFallout();
  }
  stats(): Stats {
    return this._stats;
  }
  railNetwork(): RailNetwork {
    return this._railNetwork;
  }
  mirvsLaunched(): number {
    return this._mirvsLaunched;
  }
  recordMirvLaunch(): void {
    this._mirvsLaunched++;
  }
  nextShipStagger(kind: "tradeShip" | "transportShip"): number {
    return this.shipStaggers[kind]++ % WaterPathFinder.STAGGER_SPREAD;
  }
  nationMirvTargets(): Map<PlayerID, Tick> {
    return this._nationMirvTargets;
  }
  /** The PlayerInfo object this game holds for a player id, if any. */
  findPlayerInfo(id: PlayerID): PlayerInfo | undefined {
    return (
      this._players.get(id)?.info() ??
      this._humans.find((h) => h.id === id) ??
      this._nations.find((n) => n.playerInfo.id === id)?.playerInfo
    );
  }
  miniWaterHPA(): PathFinder<number> | null {
    return this._waterManager.miniWaterHPA();
  }
  miniWaterGraph(): AbstractGraph | null {
    return this._waterManager.miniWaterGraph();
  }
  waterGraphVersion(): number {
    return this._waterManager.waterGraphVersion();
  }
  getWaterComponent(tile: TileRef): number | null {
    return this._waterManager.getWaterComponent(tile);
  }
  hasWaterComponent(tile: TileRef, component: number): boolean {
    return this._waterManager.hasWaterComponent(tile, component);
  }
  getWaterComponentSize(tile: TileRef): number | null {
    return this._waterManager.getWaterComponentSize(tile);
  }
  sharedWaterComponents(player: Player): Set<number> | null {
    return this._sharedWaterCache.get(player);
  }
  /**
   * Game-level state for a snapshot. Taken at a tick boundary, so the
   * per-tick update buffers (updates, tile pairs, player and attack quads,
   * motion plans, nuke impacts) are always drained and are not stored.
   */
  snapshotState(w: SnapshotWriter): GameState {
    // Exec list order is state: register both lists first so their table
    // rows come out in tick order.
    const execs = this.execs.map((e) => w.exec(e));
    const unInitExecs = this.unInitExecs.map((e) => w.exec(e));
    return {
      ticks: this._ticks,
      startTick: this.startTick,
      humans: this._humans.map(playerInfoData),
      nations: this._nations.map(nationData),
      players: [...this._players.values()].map((p) => w.player(p)),
      execs,
      unInitExecs,
      allianceRequests: this.allianceRequests.map((r) => w.allianceRequest(r)),
      nextPlayerID: this.nextPlayerID,
      nextUnitID: this._nextUnitID,
      nextAllianceID: this.nextAllianceID,
      units: [...this._unitMap.values()].map((u) => w.unit(u)),
      planDrivenUnitIds: [...this.planDrivenUnitIds],
      unitGrid: this.unitGrid.snapshot((u) => w.unit(u)),
      playerTeams: [...this.playerTeams],
      botTeam: this.botTeam,
      isPaused: this._isPaused,
      pathDraftTriggered: this._pathDraftTriggered,
      pathDraftActive: this._pathDraftActive,
      augmentRoundsTriggered: this._augmentRoundsTriggered,
      augmentDraftActive: this._augmentDraftActive,
      augmentDraftTicksRemaining: this._augmentDraftTicksRemaining,
      activeGameplayTicks: this._activeGameplayTicks,
      nextAllianceActionID: this._nextAllianceActionID,
      pendingAllianceActions: this._pendingAllianceActions.map((r) => ({
        ...r,
      })),
      allianceActionCooldowns: [...this._allianceActionCooldowns],
      nextTradeID: this._nextTradeID,
      pendingTradeRequests: this._pendingTradeRequests.map((r) => ({ ...r })),
      activeTradeAgreements: this._activeTradeAgreements.map((t) => ({ ...t })),
      tradeCooldowns: [...this._tradeCooldowns],
      activeBountyTargetID: this._activeBountyTargetID,
      bountyExpiresTick: this._bountyExpiresTick,
      nextBountyEligibleTick: this._nextBountyEligibleTick,
      lastBountyTargetID: this._lastBountyTargetID,
      bountiesTriggered: this._bountiesTriggered,
      bountyTilesConquered: [...this._bountyTilesConquered],
      bountyClaimsByPlayer: [...this._bountyClaimsByPlayer],
      winner:
        this._winner === null
          ? null
          : typeof this._winner === "string"
            ? { team: this._winner }
            : { player: w.player(this._winner) },
      unitsVersion: this._unitsVersion,
      territoryVersion: this._territoryVersion,
      shipStaggers: { ...this.shipStaggers },
      nationMirvTargets: [...this._nationMirvTargets],
      mirvsLaunched: this._mirvsLaunched,
      rail: w.versioned(
        RailNetworkSnapshot,
        (this._railNetwork as RailNetworkImpl).snapshot(w),
      ),
      water: w.versioned(WaterManagerSnapshot, this._waterManager.snapshot()),
      sharedWaterCache: w.versioned(
        SharedWaterCacheSnapshot,
        this._sharedWaterCache.snapshot(w),
      ),
      stats: w.versioned(StatsSnapshot, (this._stats as StatsImpl).snapshot()),
    };
  }

  /** Registers a restored player shell before any state is filled in. */
  addRestoredPlayer(player: PlayerImpl, id: PlayerID, smallID: number): void {
    this._players.set(id, player);
    this._playersBySmallID[smallID - 1] = player;
  }

  /**
   * Applies game-level state to a game constructed with `restoring`, once
   * every player, unit and execution has been restored.
   */
  restoreState(s: GameState, r: SnapshotReader): void {
    this._ticks = s.ticks;
    this.startTick = s.startTick;
    this.execs = s.execs.map((i) => r.exec(i));
    this.unInitExecs = s.unInitExecs.map((i) => r.exec(i));
    this.allianceRequests = s.allianceRequests.map((i) =>
      r.allianceRequest<AllianceRequestImpl>(i),
    );
    this.nextPlayerID = s.nextPlayerID;
    this._nextUnitID = s.nextUnitID;
    this.nextAllianceID = s.nextAllianceID;
    this._unitMap = new Map(
      s.units.map((i) => {
        const u = r.unit(i);
        return [u.id(), u];
      }),
    );
    this.planDrivenUnitIds = new Set(s.planDrivenUnitIds);
    this.unitGrid.restoreSnapshot(s.unitGrid, (i) => r.unit(i));
    this.playerTeams = [...s.playerTeams];
    this.botTeam = s.botTeam;
    this._isPaused = s.isPaused;
    this._pathDraftTriggered = s.pathDraftTriggered;
    this._pathDraftActive = s.pathDraftActive;
    this._augmentRoundsTriggered = s.augmentRoundsTriggered;
    this._augmentDraftActive = s.augmentDraftActive;
    this._augmentDraftTicksRemaining = s.augmentDraftTicksRemaining;
    this._activeGameplayTicks = s.activeGameplayTicks;
    this._nextAllianceActionID = s.nextAllianceActionID;
    this._pendingAllianceActions = s.pendingAllianceActions.map((r) => ({
      ...r,
    }));
    this._allianceActionCooldowns = new Map(s.allianceActionCooldowns);
    this._nextTradeID = s.nextTradeID;
    this._pendingTradeRequests = s.pendingTradeRequests.map((r) => ({ ...r }));
    this._activeTradeAgreements = s.activeTradeAgreements.map((t) => ({
      ...t,
    }));
    this._tradeCooldowns = new Map(s.tradeCooldowns);
    this._activeBountyTargetID = s.activeBountyTargetID;
    this._bountyExpiresTick = s.bountyExpiresTick;
    this._nextBountyEligibleTick = s.nextBountyEligibleTick;
    this._lastBountyTargetID = s.lastBountyTargetID;
    this._bountiesTriggered = s.bountiesTriggered;
    this._bountyTilesConquered = new Map(s.bountyTilesConquered);
    this._bountyClaimsByPlayer = new Map(s.bountyClaimsByPlayer);
    this._winner =
      s.winner === null
        ? null
        : "team" in s.winner
          ? s.winner.team
          : r.player(s.winner.player);
    this._unitsVersion = s.unitsVersion;
    this._territoryVersion = s.territoryVersion;
    // Not snapshotted: it only keys memos, which must not outlive the restore.
    this._structureVersion++;
    this.shipStaggers = { ...s.shipStaggers };
    this._nationMirvTargets = new Map(s.nationMirvTargets);
    this._mirvsLaunched = s.mirvsLaunched;
    (this._railNetwork as RailNetworkImpl).restoreSnapshot(
      readVersioned(RailNetworkSnapshot, s.rail),
      r,
    );
    this._waterManager.restoreSnapshot(
      readVersioned(WaterManagerSnapshot, s.water),
    );
    this._sharedWaterCache.restoreSnapshot(
      readVersioned(SharedWaterCacheSnapshot, s.sharedWaterCache),
      r,
    );
    (this._stats as StatsImpl).restoreSnapshot(
      readVersioned(StatsSnapshot, s.stats),
    );
  }

  conquerPlayer(conqueror: Player, conquered: Player) {
    if (conquered.isDisconnected() && conqueror.isOnSameTeam(conquered)) {
      const ships = conquered
        .units()
        .filter(
          (u) =>
            u.type() === UnitType.Warship ||
            u.type() === UnitType.TransportShip,
        );

      for (const ship of ships) {
        conqueror.captureUnit(ship);
      }
    }

    // Don't transfer gold when the conquered player didn't play (never attacked anyone)
    // This is especially important when starting gold is enabled
    const stats = this._stats.getPlayerStats(conquered);
    const attacksSent = stats?.attacks?.[ATTACK_INDEX_SENT] ?? 0n;
    const skipGoldTransfer =
      attacksSent === 0n && conquered.type() === PlayerType.Human;
    const gold = skipGoldTransfer ? 0n : conquered.gold();
    const goldCaptured = skipGoldTransfer
      ? 0n
      : this._config.conquerGoldAmount(conquered);

    if (skipGoldTransfer) {
      this.displayMessage(
        "events_display.conquered_no_gold",
        MessageType.CONQUERED_PLAYER,
        conqueror.id(),
        undefined,
        {
          name: conquered.displayName(),
        },
        undefined,
        conquered.id(),
      );
    } else {
      this.displayMessage(
        "events_display.received_gold_from_conquest",
        MessageType.CONQUERED_PLAYER,
        conqueror.id(),
        gold,
        {
          gold: renderNumber(goldCaptured),
          name: conquered.displayName(),
        },
        undefined,
        conquered.id(),
      );
      conqueror.addGold(goldCaptured);
      conquered.removeGold(gold);

      // Record stats
      this.stats().goldWar(conqueror, conquered, goldCaptured);
    }

    // Crownfall Victory Spoils: conquering an active enemy nation assimilates civilians, food reserves & morale
    if (
      !this._config.gameConfig().tutorial &&
      conqueror.type() !== PlayerType.Bot &&
      conquered.type() !== PlayerType.Bot &&
      !conqueror.isFriendly(conquered) &&
      !conqueror.inFiscalDeficit() &&
      !skipGoldTransfer
    ) {
      const assimilatedPop = Math.floor(conquered.civilianPopulation() * 0.35);
      if (assimilatedPop > 0) {
        conqueror.addCivilianPopulation(assimilatedPop);
      }
      if (!this._config.disableFood() && conquered.food() > 0) {
        const seizedFood = Math.floor(conquered.food() * 0.5);
        if (seizedFood > 0) {
          const cap = maxFoodStorage(
            completedStructureLevels(conqueror, UnitType.Granary),
          );
          conqueror.addFood(seizedFood, cap);
        }
      }
      conqueror.setStability(Math.min(100, conqueror.stability() + 5));
    }

    // OFM: per-kill log for standings (humans-only filtered in recordKill).
    this.stats().recordKill(conqueror, conquered, this.ticks());
    // OFM live standings: attribute the elimination so the live snapshot can
    // credit the kill (null when the conqueror has no client, e.g. a bot/nation),
    // and stamp the finishing place NOW rather than deferring to PlayerExecution:
    // if the game ends this tick (winner declared) the conquered player's
    // execution may never run again. Exclude the conquered player from the alive
    // count. PlayerExecution keeps the same stamp as a fallback for non-conquest
    // deaths; recordDeathPosition is first-write-wins, so this value sticks.
    this.stats().recordKilledBy(conquered, conqueror.clientID());
    this.stats().recordDeathPosition(
      conquered,
      this.players().filter(
        (p) => p !== conquered && p.type() !== PlayerType.Bot,
      ).length + 1,
    );

    this.addUpdate({
      type: GameUpdateType.ConquestEvent,
      conquerorId: conqueror.id(),
      conqueredId: conquered.id(),
      gold: goldCaptured,
    });

    this.resolveBountyElimination(conqueror, conquered);
  }
}

export const GameSnapshot = snapshotType({
  name: "Game",
  version: 6,
  migrations: {
    1: (d: Record<string, unknown>) => ({
      ...d,
      augmentRoundsTriggered: 0,
      augmentDraftActive: false,
      augmentDraftTicksRemaining: -1,
      activeGameplayTicks: 0,
    }),
    2: (d: Record<string, unknown>) => ({
      ...d,
      pathDraftTriggered: false,
      pathDraftActive: false,
    }),
    3: (d: Record<string, unknown>) => ({
      ...d,
      nextAllianceActionID: 1,
      pendingAllianceActions: [],
      allianceActionCooldowns: [],
    }),
    4: (d: Record<string, unknown>) => ({
      ...d,
      nextTradeID: 1,
      pendingTradeRequests: [],
      activeTradeAgreements: [],
      tradeCooldowns: [],
    }),
    5: (d: Record<string, unknown>) => ({
      ...d,
      activeBountyTargetID: null,
      bountyExpiresTick: 0,
      nextBountyEligibleTick: CROWNFALL_BOUNTY_CONFIG.firstBountyDelayTicks,
      lastBountyTargetID: null,
      bountiesTriggered: 0,
      bountyTilesConquered: [],
      bountyClaimsByPlayer: [],
    }),
  },
  schema: z.object({
    ticks: zInt(),
    startTick: zInt().nullable(),
    humans: z.array(PlayerInfoSchema),
    nations: z.array(NationSchema),
    players: z.array(zPlayerRef()),
    execs: z.array(zRef()),
    unInitExecs: z.array(zRef()),
    allianceRequests: z.array(zRef()),
    nextPlayerID: zInt(),
    nextUnitID: zInt(),
    nextAllianceID: zInt(),
    units: z.array(zRef()),
    planDrivenUnitIds: z.array(zInt()),
    unitGrid: z.array(z.array(z.tuple([UnitTypeSchema, z.array(zRef())]))),
    playerTeams: z.array(z.string()),
    botTeam: z.string(),
    isPaused: z.boolean(),
    pathDraftTriggered: z.boolean(),
    pathDraftActive: z.boolean(),
    augmentRoundsTriggered: zInt(),
    augmentDraftActive: z.boolean(),
    augmentDraftTicksRemaining: zInt(),
    activeGameplayTicks: zInt(),
    nextAllianceActionID: zInt(),
    pendingAllianceActions: z.array(
      z.object({
        id: zInt(),
        requestorID: z.string(),
        recipientID: z.string(),
        actionType: z.enum(AllianceActionType),
        targetID: z.string().nullable(),
        createdAt: zInt(),
        expiresAt: zInt(),
      }),
    ),
    allianceActionCooldowns: z.array(z.tuple([z.string(), zInt()])),
    nextTradeID: zInt(),
    pendingTradeRequests: z.array(
      z.object({
        id: zInt(),
        proposerID: z.string(),
        recipientID: z.string(),
        tradeType: z.enum(TradeAgreementType),
        createdAt: zInt(),
        expiresAt: zInt(),
      }),
    ),
    activeTradeAgreements: z.array(
      z.object({
        id: zInt(),
        proposerID: z.string(),
        partnerID: z.string(),
        tradeType: z.enum(TradeAgreementType),
        createdAt: zInt(),
      }),
    ),
    tradeCooldowns: z.array(z.tuple([z.string(), zInt()])),
    activeBountyTargetID: z.string().nullable(),
    bountyExpiresTick: zInt(),
    nextBountyEligibleTick: zInt(),
    lastBountyTargetID: z.string().nullable(),
    bountiesTriggered: zInt(),
    bountyTilesConquered: z.array(z.tuple([z.string(), zInt()])),
    bountyClaimsByPlayer: z.array(z.tuple([z.string(), zInt()])),
    winner: z
      .union([
        z.object({ player: zPlayerRef() }),
        z.object({ team: z.string() }),
      ])
      .nullable(),
    unitsVersion: zInt(),
    territoryVersion: zInt(),
    shipStaggers: z.object({ tradeShip: zInt(), transportShip: zInt() }),
    nationMirvTargets: z.array(z.tuple([z.string(), zInt()])),
    mirvsLaunched: zInt(),
    rail: VersionedSchema,
    water: VersionedSchema,
    sharedWaterCache: VersionedSchema,
    stats: VersionedSchema,
  }),
});
export type GameState = z.infer<typeof GameSnapshot.schema>;

const ALL_GAME_UPDATE_TYPES: readonly GameUpdateType[] = Object.values(
  GameUpdateType,
).filter((key): key is GameUpdateType => typeof key === "number");

const createGameUpdatesMap = (): GameUpdates => {
  const map = {} as GameUpdates;
  for (let i = 0; i < ALL_GAME_UPDATE_TYPES.length; i++) {
    map[ALL_GAME_UPDATE_TYPES[i]] = [];
  }
  return map;
};
