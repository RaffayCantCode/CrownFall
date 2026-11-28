import {
  AllianceActionType,
  AugmentId,
  BuildableUnit,
  BuildMenus,
  DevelopmentPath,
  Gold,
  NationalProject,
  PlayerBuildableUnitType,
  PlayerType,
  TaxRate,
  Tick,
  TradeAgreementType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import {
  type AllianceActionReplyUpdate,
  type AllianceActionRequestUpdate,
  type BountyUpdate,
  GameUpdateType,
} from "@openfront/engine-api/game/GameUpdates";
import { CROWNFALL_ALLIANCE_CONFIG } from "@openfront/engine-lib/configuration/CrownfallAlliances";
import {
  completedStructureLevels,
  computeStabilityBreakdown,
  maxCivilianPopulation,
  requiredResearchLevels,
  sciencePerSecond,
  stabilityBand,
  type StabilityBreakdown,
} from "@openfront/engine-lib/configuration/CrownfallConfig";
import {
  computeFoodBreakdown,
  computeFoodStabilityDelta,
  type FoodBreakdown,
} from "@openfront/engine-lib/configuration/CrownfallFood";
import {
  CROWNFALL_TRADE_CONFIG,
  effectivePartnerPath,
} from "@openfront/engine-lib/configuration/CrownfallTrade";
import {
  DEV_PATH_TIERS,
  maxTierForPath,
  nextTierGoldCost,
  nextTierScienceCost,
  pathLevelFor,
  type PathProgress,
} from "@openfront/engine-lib/configuration/CrownfallPaths";
import {
  isProjectUnlocked,
  NATIONAL_PROJECTS_BY_ID,
  rollMatchOperations,
  type NationalProjectDefinition,
} from "@openfront/engine-lib/configuration/CrownfallProjects";
import { renderNumber, renderTroops } from "@openfront/engine-lib/Format";
import { assetUrl } from "@openfront/shared/AssetUrls";
import { EventBus } from "@openfront/shared/EventBus";
import { html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { Controller } from "../../Controller";
import type { InputHandler } from "../../InputHandler";
import { GoToPlayerEvent } from "../../TransformHandler";
import {
  SendActivateNationalProjectIntentEvent,
  SendAllianceActionReplyIntentEvent,
  SendAllianceActionRequestIntentEvent,
  SendAllianceExtensionIntentEvent,
  SendAllianceRejectIntentEvent,
  SendAllianceRequestIntentEvent,
  SendBreakAllianceIntentEvent,
  SendDonateGoldIntentEvent,
  SendDonateTroopsIntentEvent,
  SendSelectDevPathIntentEvent,
  SendSetTaxRateIntentEvent,
  SendTradeCancelIntentEvent,
  SendTradeReplyIntentEvent,
  SendTradeRequestIntentEvent,
  SendUnlockDevTierIntentEvent,
} from "../../Transport";
import type { UIState } from "../../UIState";
import {
  HUD_NOTIFICATION_DOTS_KEY,
  HUD_POSITION_KEY,
  type HudPosition,
  USER_SETTINGS_CHANGED_EVENT,
  UserSettings,
} from "../../UserSettings";
import { translateText } from "../../Utils";
import { GameView } from "../../view";
import type { PlayerView } from "../../view/PlayerView";
import {
  atomBombIcon,
  cityIcon,
  defensePostIcon,
  factoryIcon,
  goldCoinIcon,
  hydrogenBombIcon,
  mirvIcon,
  missileSiloIcon,
  portIcon,
  samLauncherIcon,
  warshipIcon,
} from "../HotbarIcons";

const militaryPathIcon = assetUrl("images/crownfall/path-military.svg");
const politicalPathIcon = assetUrl("images/crownfall/path-political.svg");
const scientificPathIcon = assetUrl("images/crownfall/path-scientific.svg");
const housingIcon = assetUrl("images/PowerPlantIconWhite.svg");
const publicServicesIcon = assetUrl("images/PublicServicesIconWhite.svg");
const researchCentreIcon = assetUrl("images/ResearchCentreIconWhite.svg");
const spyNetworkIcon = assetUrl("images/SpyNetworkIconWhite.svg");
const orbitalRadarIcon = assetUrl("images/OrbitalRadarIconWhite.svg");
const cyberCommandIcon = assetUrl("images/CyberCommandIconWhite.svg");
const farmIcon = assetUrl("images/FarmIconWhite.svg");
const bakeryIcon = assetUrl("images/BakeryIconWhite.svg");
const granaryIcon = assetUrl("images/GranaryIconWhite.svg");

const PROJECT_ICONS: Record<NationalProject, string> = {
  [NationalProject.FrontlineConscription]: defensePostIcon,
  [NationalProject.ParatrooperDrop]: militaryPathIcon,
  [NationalProject.SurgeMobilisation]: assetUrl(
    "images/crownfall/ops-mobilisation.svg",
  ),
  [NationalProject.BunkerNetwork]: defensePostIcon,
  [NationalProject.ArmoredSpearhead]: missileSiloIcon,
  [NationalProject.ScorchedEarth]: atomBombIcon,
  [NationalProject.DefconBarrage]: mirvIcon,
  [NationalProject.ThermonuclearReadiness]: hydrogenBombIcon,
  [NationalProject.WarBonds]: goldCoinIcon,
  [NationalProject.TradeFleetCharter]: portIcon,
  [NationalProject.NationalReconciliation]: assetUrl(
    "images/crownfall/ops-reconciliation.svg",
  ),
  [NationalProject.MartialLaw]: politicalPathIcon,
  [NationalProject.SovereignBastion]: publicServicesIcon,
  [NationalProject.DiplomaticSubsidy]: goldCoinIcon,
  [NationalProject.ImperialGoldenAge]: cityIcon,
  [NationalProject.ContinentalHegemony]: publicServicesIcon,
  [NationalProject.ResearchGrant]: researchCentreIcon,
  [NationalProject.CrashResearchProgram]: scientificPathIcon,
  [NationalProject.EmpOverdrive]: assetUrl("images/crownfall/ops-emp.svg"),
  [NationalProject.CyberBlackout]: cyberCommandIcon,
  [NationalProject.DroneFoundry]: factoryIcon,
  [NationalProject.NaniteConstruction]: housingIcon,
  [NationalProject.OrbitalAegis]: orbitalRadarIcon,
  [NationalProject.ProjectSingularity]: cyberCommandIcon,
};

interface BuildingMenuEntry {
  unitType: PlayerBuildableUnitType;
  labelKey: string;
  roleKey: string;
  icon: string;
  hotkey?: string;
  counted: boolean;
  prereqUnit?: UnitType;
  prereqKey?: string;
}

const CIVIC_BUILDINGS: readonly BuildingMenuEntry[] = [
  {
    unitType: UnitType.City,
    labelKey: "unit_type.city",
    roleKey: "crownfall.hud.role_city",
    icon: cityIcon,
    hotkey: "1",
    counted: true,
  },
  {
    unitType: UnitType.Factory,
    labelKey: "unit_type.factory",
    roleKey: "crownfall.hud.role_factory",
    icon: factoryIcon,
    hotkey: "2",
    counted: true,
  },
  {
    unitType: UnitType.Port,
    labelKey: "unit_type.port",
    roleKey: "crownfall.hud.role_port",
    icon: portIcon,
    hotkey: "3",
    counted: true,
  },
  {
    unitType: UnitType.Housing,
    labelKey: "unit_type.housing",
    roleKey: "crownfall.hud.role_housing",
    icon: housingIcon,
    counted: true,
  },
  {
    unitType: UnitType.PublicServices,
    labelKey: "unit_type.public_services",
    roleKey: "crownfall.hud.role_public_services",
    icon: publicServicesIcon,
    counted: true,
  },
  {
    unitType: UnitType.ResearchCentre,
    labelKey: "unit_type.research_centre",
    roleKey: "crownfall.hud.role_research_centre",
    icon: researchCentreIcon,
    counted: true,
  },
  {
    unitType: UnitType.Farm,
    labelKey: "unit_type.farm",
    roleKey: "crownfall.hud.role_farm",
    icon: farmIcon,
    counted: true,
  },
  {
    unitType: UnitType.Bakery,
    labelKey: "unit_type.bakery",
    roleKey: "crownfall.hud.role_bakery",
    icon: bakeryIcon,
    counted: true,
  },
  {
    unitType: UnitType.Granary,
    labelKey: "unit_type.granary",
    roleKey: "crownfall.hud.role_granary",
    icon: granaryIcon,
    counted: true,
  },
  {
    unitType: UnitType.SpyNetwork,
    labelKey: "unit_type.spy_network",
    roleKey: "crownfall.hud.role_spy_network",
    icon: spyNetworkIcon,
    counted: true,
  },
];

const MILITARY_BUILDINGS: readonly BuildingMenuEntry[] = [
  {
    unitType: UnitType.DefensePost,
    labelKey: "unit_type.defense_post",
    roleKey: "crownfall.hud.role_defense_post",
    icon: defensePostIcon,
    hotkey: "4",
    counted: true,
  },
  {
    unitType: UnitType.MissileSilo,
    labelKey: "unit_type.missile_silo",
    roleKey: "crownfall.hud.role_missile_silo",
    icon: missileSiloIcon,
    hotkey: "5",
    counted: true,
  },
  {
    unitType: UnitType.SAMLauncher,
    labelKey: "unit_type.sam_launcher",
    roleKey: "crownfall.hud.role_sam_launcher",
    icon: samLauncherIcon,
    hotkey: "6",
    counted: true,
  },
  {
    unitType: UnitType.Warship,
    labelKey: "unit_type.warship",
    roleKey: "crownfall.hud.role_warship",
    icon: warshipIcon,
    hotkey: "7",
    counted: true,
    prereqUnit: UnitType.Port,
    prereqKey: "crownfall.hud.needs_port",
  },
  {
    unitType: UnitType.AtomBomb,
    labelKey: "unit_type.atom_bomb",
    roleKey: "crownfall.hud.role_atom_bomb",
    icon: atomBombIcon,
    hotkey: "8",
    counted: false,
    prereqUnit: UnitType.MissileSilo,
    prereqKey: "crownfall.hud.needs_silo",
  },
  {
    unitType: UnitType.HydrogenBomb,
    labelKey: "unit_type.hydrogen_bomb",
    roleKey: "crownfall.hud.role_hydrogen_bomb",
    icon: hydrogenBombIcon,
    hotkey: "9",
    counted: false,
    prereqUnit: UnitType.MissileSilo,
    prereqKey: "crownfall.hud.needs_silo",
  },
  {
    unitType: UnitType.MIRV,
    labelKey: "unit_type.mirv",
    roleKey: "crownfall.hud.role_mirv",
    icon: mirvIcon,
    hotkey: "0",
    counted: false,
    prereqUnit: UnitType.MissileSilo,
    prereqKey: "crownfall.hud.needs_silo",
  },
  {
    unitType: UnitType.OrbitalRadar,
    labelKey: "unit_type.orbital_radar",
    roleKey: "crownfall.hud.role_orbital_radar",
    icon: orbitalRadarIcon,
    counted: true,
  },
  {
    unitType: UnitType.CyberCommand,
    labelKey: "unit_type.cyber_command",
    roleKey: "crownfall.hud.role_cyber_command",
    icon: cyberCommandIcon,
    counted: true,
  },
];

const MILITARY_UNIT_SET = new Set<PlayerBuildableUnitType>(
  MILITARY_BUILDINGS.map((b) => b.unitType),
);

const ALL_BUILDING_ENTRIES: readonly BuildingMenuEntry[] = [
  ...CIVIC_BUILDINGS,
  ...MILITARY_BUILDINGS,
];

const BUILDING_LABEL_BY_TYPE = new Map<PlayerBuildableUnitType, string>(
  ALL_BUILDING_ENTRIES.map((b) => [b.unitType, b.labelKey]),
);

const ALL_PATHS: readonly {
  path: DevelopmentPath;
  icon: string;
  accentBorder: string;
  accentText: string;
  pipBg: string;
}[] = [
  {
    path: DevelopmentPath.Military,
    icon: militaryPathIcon,
    accentBorder: "border-rose-500/45",
    accentText: "text-rose-300",
    pipBg: "bg-rose-400",
  },
  {
    path: DevelopmentPath.Political,
    icon: politicalPathIcon,
    accentBorder: "border-amber-400/50",
    accentText: "text-amber-300",
    pipBg: "bg-amber-400",
  },
  {
    path: DevelopmentPath.Scientific,
    icon: scientificPathIcon,
    accentBorder: "border-sky-400/50",
    accentText: "text-sky-300",
    pipBg: "bg-sky-400",
  },
];

type OpenHudMenu =
  | "none"
  | "stability"
  | "food"
  | "bounty"
  | "buildings"
  | "arsenal"
  | "paths"
  | "ops"
  | "alliances";

interface OutgoingActionState {
  actionType: AllianceActionType;
  sentAt: Tick;
  expiresAt: Tick;
  cooldownUntil: Tick;
}

function formatProText(raw: string): string {
  return `+ ${raw.replace(/^[+−-]\s*/, "")}`;
}

function formatConText(raw: string): string {
  return `− ${raw.replace(/^[+−-]\s*/, "")}`;
}

function renderRedDot() {
  return html`<span
    class="absolute -top-1 -right-1 flex h-2.5 w-2.5 pointer-events-none"
    aria-hidden="true"
  >
    <span
      class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"
    ></span>
    <span
      class="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 ring-2 ring-[#080b12]"
    ></span>
  </span>`;
}

@customElement("national-dashboard")
export class NationalDashboard extends LitElement implements Controller {
  public game: GameView;
  public eventBus: EventBus;
  public uiState?: UIState;
  public inputHandler?: InputHandler;

  @state() private _visible = false;
  @state() private _civilians = 0;
  @state() private _food = 1500;
  @state() private _foodBreakdown: FoodBreakdown | null = null;
  @state() private _rebellionMeter = 0;
  @state() private _inFiscalDeficit = false;
  @state() private _civilianCap = 0;
  @state() private _science = 0;
  @state() private _scienceRate = 0;
  @state() private _stability = 75;
  @state() private _taxRate: TaxRate = TaxRate.Normal;
  @state() private _breakdown: StabilityBreakdown | null = null;
  @state() private _progress: PathProgress = {
    primaryPath: null,
    militaryLevel: 0,
    politicalLevel: 0,
    scientificLevel: 0,
  };
  @state() private _gold: Gold = 0n;
  @state() private _currentTick = 0;
  @state() private _activeProject: NationalProject | null = null;
  @state() private _activeProjectExpiresTick = 0;
  @state() private _projectCooldownUntilTick = 0;
  @state() private _selectedAugments: readonly AugmentId[] = [];
  @state() private _ghostStructure: PlayerBuildableUnitType | null = null;
  @state() private _activeBounty: BountyUpdate | null = null;
  @state() private _allyCount = 0;
  @state() private _buildingsAlert = false;
  @state() private _arsenalAlert = false;
  @state() private _alliancesAlert = false;
  @state() private _openPanel: OpenHudMenu = "none";
  @state() private _hudPosition: HudPosition = new UserSettings().hudPosition();
  @state() private _showDots: boolean = new UserSettings().hudNotificationDots();

  private _playerBuildables: BuildableUnit[] = [];
  private _buildablesRefreshTick = -10;
  private _knownCivicAffordable = new Set<PlayerBuildableUnitType>();
  private _knownArsenalAffordable = new Set<PlayerBuildableUnitType>();
  private _buildablesSeeded = false;
  private _incomingActionRequests: AllianceActionRequestUpdate[] = [];
  private _outgoingActionByAlly = new Map<string, OutgoingActionState>();
  private _knownIncomingAllianceCount = 0;
  private _knownIncomingTradeCount = 0;
  private _borderSmallIDs = new Set<number>();
  private _borderRefreshTick = -20;

  private onHudSettingsChanged = () => {
    const s = new UserSettings();
    this._hudPosition = s.hudPosition();
    this._showDots = s.hudNotificationDots();
    this.requestUpdate();
  };

  connectedCallback() {
    super.connectedCallback();
    globalThis.addEventListener(
      `${USER_SETTINGS_CHANGED_EVENT}:${HUD_POSITION_KEY}`,
      this.onHudSettingsChanged,
    );
    globalThis.addEventListener(
      `${USER_SETTINGS_CHANGED_EVENT}:${HUD_NOTIFICATION_DOTS_KEY}`,
      this.onHudSettingsChanged,
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    globalThis.removeEventListener(
      `${USER_SETTINGS_CHANGED_EVENT}:${HUD_POSITION_KEY}`,
      this.onHudSettingsChanged,
    );
    globalThis.removeEventListener(
      `${USER_SETTINGS_CHANGED_EVENT}:${HUD_NOTIFICATION_DOTS_KEY}`,
      this.onHudSettingsChanged,
    );
  }

  private popoverPositionClass(size: "narrow" | "medium" | "wide"): string {
    const pos = this._hudPosition;
    if (pos === "left") {
      const width =
        size === "narrow"
          ? "w-72"
          : size === "medium"
            ? "w-[min(calc(100vw-320px),620px)]"
            : "w-[min(calc(100vw-320px),680px)]";
      return `absolute bottom-0 left-full ml-2.5 ${width}`;
    }
    if (pos === "right") {
      const width =
        size === "narrow"
          ? "w-72"
          : size === "medium"
            ? "w-[min(calc(100vw-320px),620px)]"
            : "w-[min(calc(100vw-320px),680px)]";
      return `absolute bottom-0 right-full mr-2.5 ${width}`;
    }
    const width =
      size === "narrow"
        ? "left-2 w-72"
        : size === "medium"
          ? "left-1/2 -translate-x-1/2 w-[min(95vw,640px)]"
          : "left-1/2 -translate-x-1/2 w-[min(96vw,700px)]";
    return `absolute bottom-full mb-2 ${width}`;
  }

  createRenderRoot() {
    return this;
  }

  init(): void {
    this._visible = false;
    this._openPanel = "none";
    this._activeBounty = null;
    this._playerBuildables = [];
    this._buildablesRefreshTick = -10;
    this._knownCivicAffordable.clear();
    this._knownArsenalAffordable.clear();
    this._buildablesSeeded = false;
    this._buildingsAlert = false;
    this._arsenalAlert = false;
    this._alliancesAlert = false;
    this._incomingActionRequests = [];
    this._outgoingActionByAlly.clear();
    this._knownIncomingAllianceCount = 0;
    this._knownIncomingTradeCount = 0;
    this._borderSmallIDs.clear();
    this._borderRefreshTick = -20;
  }

  tick(): void {
    if (!this.game || this.game.inSpawnPhase()) {
      if (this._visible) {
        this._visible = false;
      }
      return;
    }

    const myPlayer = this.game.myPlayer();
    if (!myPlayer || !myPlayer.isAlive()) {
      if (this._visible) {
        this._visible = false;
      }
      return;
    }

    this._visible = true;
    const nowTick = this.game.ticks();

    this.processAllianceUpdates(myPlayer, nowTick);

    if (nowTick - this._buildablesRefreshTick >= 5) {
      this._buildablesRefreshTick = nowTick;
      myPlayer
        .buildables(undefined, BuildMenus.types)
        .then((list) => {
          this._playerBuildables = list;
          this.updateBuildingAffordabilityAlerts();
          if (
            this._openPanel === "buildings" ||
            this._openPanel === "arsenal"
          ) {
            this.requestUpdate();
          }
        })
        .catch(() => {});
    } else if (this._buildablesSeeded) {
      this.updateBuildingAffordabilityAlerts();
    }

    const civ = myPlayer.civilianPopulation();
    const food = myPlayer.food();
    const foodEnabled = !this.game.config().disableFood();
    const mods = myPlayer.pathModifiers();
    const foodBreakdown = foodEnabled
      ? computeFoodBreakdown(
          myPlayer,
          civ,
          food,
          undefined,
          undefined,
          undefined,
          myPlayer.netTradeFoodPerSec(),
          mods.foodProductionPercent,
        )
      : null;
    const foodStabDelta = foodBreakdown
      ? computeFoodStabilityDelta(
          foodBreakdown,
          completedStructureLevels(myPlayer, UnitType.Bakery),
        )
      : 0;
    const cap = maxCivilianPopulation(myPlayer);
    const sci = myPlayer.science();
    const stab = myPlayer.stability();
    const reb = myPlayer.rebellionMeter();
    const deficit = myPlayer.inFiscalDeficit();
    const tax = myPlayer.taxRate();
    const progress = myPlayer.pathProgress();
    const gold = myPlayer.gold();
    const activeProj = myPlayer.activeProject();
    const activeExp = myPlayer.activeProjectExpiresTick();
    const cooldownUntil = myPlayer.projectCooldownUntilTick();
    const selectedAugs = myPlayer.selectedAugments();
    const ghost = this.uiState?.ghostStructure ?? null;
    const alliesCount = myPlayer.alliances().length;
    const sciRate = sciencePerSecond(myPlayer, civ, stab, mods);
    const breakdown = computeStabilityBreakdown(
      myPlayer,
      tax,
      civ,
      myPlayer.incomingAttacks().length,
      mods,
      foodStabDelta,
      myPlayer.outgoingPlayerWarsCount(),
      myPlayer.unintegratedTiles(),
      deficit,
    );

    if (
      civ !== this._civilians ||
      food !== this._food ||
      foodBreakdown?.netPerMin !== this._foodBreakdown?.netPerMin ||
      cap !== this._civilianCap ||
      sci !== this._science ||
      sciRate !== this._scienceRate ||
      stab !== this._stability ||
      reb !== this._rebellionMeter ||
      deficit !== this._inFiscalDeficit ||
      tax !== this._taxRate ||
      gold !== this._gold ||
      nowTick !== this._currentTick ||
      activeProj !== this._activeProject ||
      activeExp !== this._activeProjectExpiresTick ||
      cooldownUntil !== this._projectCooldownUntilTick ||
      ghost !== this._ghostStructure ||
      alliesCount !== this._allyCount ||
      selectedAugs.length !== this._selectedAugments.length ||
      this._breakdown?.target !== breakdown.target ||
      this._progress.primaryPath !== progress.primaryPath ||
      this._progress.militaryLevel !== progress.militaryLevel ||
      this._progress.politicalLevel !== progress.politicalLevel ||
      this._progress.scientificLevel !== progress.scientificLevel
    ) {
      this._civilians = civ;
      this._food = food;
      this._foodBreakdown = foodBreakdown;
      this._civilianCap = cap;
      this._science = sci;
      this._scienceRate = sciRate;
      this._stability = stab;
      this._rebellionMeter = reb;
      this._inFiscalDeficit = deficit;
      this._taxRate = tax;
      this._gold = gold;
      this._currentTick = nowTick;
      this._activeProject = activeProj;
      this._activeProjectExpiresTick = activeExp;
      this._projectCooldownUntilTick = cooldownUntil;
      this._ghostStructure = ghost;
      this._allyCount = alliesCount;
      this._selectedAugments = selectedAugs;
      this._breakdown = breakdown;
      this._progress = progress;
    } else if (this._openPanel === "alliances") {
      this.requestUpdate();
    }
  }

  private processAllianceUpdates(myPlayer: PlayerView, nowTick: Tick): void {
    // Prune expired incoming action requests
    if (this._incomingActionRequests.length > 0) {
      this._incomingActionRequests = this._incomingActionRequests.filter(
        (r) => r.expiresAt > nowTick,
      );
    }

    // Detect incoming alliance proposals for dot badge
    const incomingProposals = this.game
      .playerViews()
      .filter(
        (p) =>
          p !== myPlayer &&
          p.isAlive() &&
          !myPlayer.isAlliedWith(p) &&
          p.isRequestingAllianceWith(myPlayer),
      ).length;
    if (
      incomingProposals > this._knownIncomingAllianceCount &&
      this._openPanel !== "alliances"
    ) {
      this._alliancesAlert = true;
    }
    this._knownIncomingAllianceCount = incomingProposals;

    const incomingTrades = myPlayer.incomingTradeRequests().length;
    if (
      incomingTrades > this._knownIncomingTradeCount &&
      this._openPanel !== "alliances"
    ) {
      this._alliancesAlert = true;
    }
    this._knownIncomingTradeCount = incomingTrades;

    if (nowTick - this._borderRefreshTick >= 20) {
      this._borderRefreshTick = nowTick;
      myPlayer
        .borderTiles()
        .then((bt) => {
          const myID = myPlayer.smallID();
          const next = new Set<number>();
          for (const t of bt.borderTiles) {
            for (const nb of this.game.neighbors(t)) {
              const ownerID = this.game.ownerID(nb);
              if (ownerID !== 0 && ownerID !== myID) {
                next.add(ownerID);
              }
            }
          }
          this._borderSmallIDs = next;
        })
        .catch(() => {});
    }

    const updates = this.game.updatesSinceLastTick();
    if (!updates) return;

    const bountyUpdates = updates[GameUpdateType.Bounty];
    if (bountyUpdates && bountyUpdates.length > 0) {
      const latest = bountyUpdates[bountyUpdates.length - 1];
      this._activeBounty = latest.active ? latest : null;
      if (!latest.active && this._openPanel === "bounty") {
        this._openPanel = "none";
      }
    }

    const actionReqs = updates[GameUpdateType.AllianceActionRequest];
    if (actionReqs && actionReqs.length > 0) {
      for (const req of actionReqs) {
        if (req.recipientID === myPlayer.smallID()) {
          this._incomingActionRequests = [
            ...this._incomingActionRequests.filter(
              (r) => r.requestID !== req.requestID,
            ),
            req,
          ];
          if (this._openPanel !== "alliances") {
            this._alliancesAlert = true;
          }
        } else if (req.requestorID === myPlayer.smallID()) {
          const ally = this.game.playerBySmallID(
            req.recipientID,
          ) as PlayerView | null;
          if (ally) {
            this._outgoingActionByAlly.set(ally.id(), {
              actionType: req.actionType,
              sentAt: req.createdAt,
              expiresAt: req.expiresAt,
              cooldownUntil:
                req.createdAt + CROWNFALL_ALLIANCE_CONFIG.requestCooldownTicks,
            });
          }
        }
      }
    }

    const actionReplies = updates[GameUpdateType.AllianceActionReply];
    if (actionReplies && actionReplies.length > 0) {
      for (const rep of actionReplies) {
        if (rep.recipientID === myPlayer.smallID()) {
          this._incomingActionRequests = this._incomingActionRequests.filter(
            (r) => r.requestID !== rep.requestID,
          );
        }
        if (rep.requestorID === myPlayer.smallID()) {
          const ally = this.game.playerBySmallID(
            rep.recipientID,
          ) as PlayerView | null;
          if (ally) {
            const existing = this._outgoingActionByAlly.get(ally.id());
            if (existing) {
              this._outgoingActionByAlly.set(ally.id(), {
                ...existing,
                expiresAt: nowTick,
              });
            }
          }
          this.formatAllianceReplyText(rep);
          // Notification handled by bottom-right events panel
          if (this._openPanel !== "alliances") {
            this._alliancesAlert = true;
          }
        }
      }
    }

    const allianceReplies = updates[GameUpdateType.AllianceRequestReply];
    if (allianceReplies && allianceReplies.length > 0) {
      for (const rep of allianceReplies) {
        if (rep.request.requestorID === myPlayer.smallID()) {
          // Notification handled by bottom-right events panel
          if (this._openPanel !== "alliances") {
            this._alliancesAlert = true;
          }
        }
      }
    }
  }

  private formatAllianceReplyText(update: AllianceActionReplyUpdate): string {
    const recipient = this.game.playerBySmallID(
      update.recipientID,
    ) as PlayerView | null;
    const name = recipient?.displayName?.() ?? "Ally";
    const targetName =
      update.targetID !== undefined && update.targetID !== null
        ? ((
            this.game.playerBySmallID(update.targetID) as PlayerView | null
          )?.displayName?.() ?? "")
        : "";
    const troopsStr =
      update.troopsAmount !== undefined
        ? renderTroops(update.troopsAmount)
        : "0";
    const goldStr =
      update.goldAmount !== undefined ? renderNumber(update.goldAmount) : "0";

    if (update.accepted) {
      switch (update.actionType) {
        case AllianceActionType.TroopsForGold:
          return translateText(
            "crownfall.alliance.reply_accept_troops_for_gold",
            { name, troops: troopsStr, gold: goldStr },
          );
        case AllianceActionType.GoldForTroops:
          return translateText(
            "crownfall.alliance.reply_accept_gold_for_troops",
            { name, gold: goldStr, troops: troopsStr },
          );
        case AllianceActionType.GoldAid:
          return translateText("crownfall.alliance.reply_accept_gold_aid", {
            name,
            gold: goldStr,
          });
        case AllianceActionType.JointAttack:
          return translateText("crownfall.alliance.reply_accept_joint_attack", {
            name,
            target: targetName,
            troops: troopsStr,
          });
        case AllianceActionType.DefenseAid:
          return translateText("crownfall.alliance.reply_accept_defense_aid", {
            name,
            troops: troopsStr,
          });
        case AllianceActionType.Reinforcements:
        default:
          return translateText(
            "crownfall.alliance.reply_accept_reinforcements",
            { name, troops: troopsStr },
          );
      }
    }
    const actionLabel = translateText(
      `crownfall.alliance.label_${update.actionType}`,
    );
    if (update.reason === "expired") {
      return translateText("crownfall.alliance.reply_expired", {
        name,
        action: actionLabel,
      });
    }
    if (update.reason === "insufficient") {
      return translateText("crownfall.alliance.reply_insufficient", {
        name,
        action: actionLabel,
      });
    }
    return translateText("crownfall.alliance.reply_declined", {
      name,
      action: actionLabel,
    });
  }

  private updateBuildingAffordabilityAlerts(): void {
    if (this._playerBuildables.length === 0) return;

    const civicAffordable = new Set<PlayerBuildableUnitType>();
    for (const entry of CIVIC_BUILDINGS) {
      if (this.canBuildUnit(entry.unitType)) {
        civicAffordable.add(entry.unitType);
      }
    }

    const arsenalAffordable = new Set<PlayerBuildableUnitType>();
    for (const entry of MILITARY_BUILDINGS) {
      if (this.canBuildUnit(entry.unitType)) {
        arsenalAffordable.add(entry.unitType);
      }
    }

    if (!this._buildablesSeeded) {
      this._buildablesSeeded = true;
      this._knownCivicAffordable = civicAffordable;
      this._knownArsenalAffordable = arsenalAffordable;
      if (civicAffordable.size > 0 && this._openPanel !== "buildings") {
        this._buildingsAlert = true;
      }
      if (arsenalAffordable.size > 0 && this._openPanel !== "arsenal") {
        this._arsenalAlert = true;
      }
      return;
    }

    let newlyCivic = false;
    for (const u of civicAffordable) {
      if (!this._knownCivicAffordable.has(u)) {
        newlyCivic = true;
        break;
      }
    }
    let newlyArsenal = false;
    for (const u of arsenalAffordable) {
      if (!this._knownArsenalAffordable.has(u)) {
        newlyArsenal = true;
        break;
      }
    }

    this._knownCivicAffordable = civicAffordable;
    this._knownArsenalAffordable = arsenalAffordable;

    if (civicAffordable.size === 0) {
      this._buildingsAlert = false;
    } else if (newlyCivic && this._openPanel !== "buildings") {
      this._buildingsAlert = true;
    }

    if (arsenalAffordable.size === 0) {
      this._arsenalAlert = false;
    } else if (newlyArsenal && this._openPanel !== "arsenal") {
      this._arsenalAlert = true;
    }
  }

  private unitCost(unitType: UnitType): Gold {
    for (const bu of this._playerBuildables) {
      if (bu.type === unitType) return bu.cost;
    }
    return 0n;
  }

  private unitScienceCost(unitType: UnitType): number {
    for (const bu of this._playerBuildables) {
      if (bu.type === unitType) return bu.scienceCost ?? 0;
    }
    return 0;
  }

  private canBuildUnit(unitType: PlayerBuildableUnitType): boolean {
    if (!this.game || this.game.config().isUnitDisabled(unitType)) return false;
    if (this._playerBuildables.length === 0) return false;
    const myPlayer = this.game.myPlayer();
    if (!myPlayer) return false;
    const cost = this.unitCost(unitType);
    const sciCost = this.unitScienceCost(unitType);
    if (
      cost <= 0n &&
      sciCost <= 0 &&
      !this._playerBuildables.some((b) => b.type === unitType)
    ) {
      return false;
    }
    if (cost > myPlayer.gold()) return false;
    if (sciCost > 0 && myPlayer.science() < sciCost) return false;
    const reqResearch = requiredResearchLevels(unitType);
    if (
      reqResearch > 0 &&
      completedStructureLevels(myPlayer, UnitType.ResearchCentre) < reqResearch
    ) {
      return false;
    }
    switch (unitType) {
      case UnitType.AtomBomb:
      case UnitType.HydrogenBomb:
      case UnitType.MIRV:
        return myPlayer.units(UnitType.MissileSilo).length > 0;
      case UnitType.Warship:
        return myPlayer.units(UnitType.Port).length > 0;
      default:
        return true;
    }
  }

  private selectBuildingForPlacement(unitType: PlayerBuildableUnitType) {
    if (!this.inputHandler) return;
    if (this.uiState?.ghostStructure === unitType) {
      this.inputHandler.setGhostStructure(null, "GUIclick");
      this._ghostStructure = null;
      return;
    }
    if (!this.canBuildUnit(unitType)) return;
    this.inputHandler.setGhostStructure(unitType, "GUIclick");
    this._ghostStructure = unitType;
    this._openPanel = "none";
  }

  private cancelPlacement() {
    this.inputHandler?.setGhostStructure(null, "GUIclick");
    this._ghostStructure = null;
  }

  private setTaxRate(rate: TaxRate) {
    if (rate === this._taxRate) return;
    this.eventBus?.emit(new SendSetTaxRateIntentEvent(rate));
  }

  private selectPrimaryPath(path: DevelopmentPath) {
    if (this._progress.primaryPath !== null) return;
    this.eventBus?.emit(new SendSelectDevPathIntentEvent(path));
  }

  private unlockTier(path: DevelopmentPath) {
    const sciCost = nextTierScienceCost(this._progress, path);
    const goldCost = nextTierGoldCost(this._progress, path);
    if (
      sciCost === null ||
      goldCost === null ||
      this._science < sciCost ||
      this._gold < goldCost
    ) {
      return;
    }
    this.eventBus?.emit(new SendUnlockDevTierIntentEvent(path));
  }

  private togglePanel(panel: OpenHudMenu) {
    const next = this._openPanel === panel ? "none" : panel;
    this._openPanel = next;
    if (next === "buildings") {
      this._buildingsAlert = false;
    } else if (next === "arsenal") {
      this._arsenalAlert = false;
    } else if (next === "alliances") {
      this._alliancesAlert = false;
    }
  }

  private activateProject(project: NationalProject) {
    if (this._activeProject !== null) return;
    if (this._currentTick < this._projectCooldownUntilTick) return;
    if (!isProjectUnlocked(this._progress, project)) return;
    this.eventBus?.emit(new SendActivateNationalProjectIntentEvent(project));
  }

  private hasPathActionAvailable(): boolean {
    if (this.game?.config().disablePaths()) return false;
    if (this._progress.primaryPath === null) return true;
    for (const { path } of ALL_PATHS) {
      const sciCost = nextTierScienceCost(this._progress, path);
      const goldCost = nextTierGoldCost(this._progress, path);
      if (
        sciCost !== null &&
        goldCost !== null &&
        this._science >= sciCost &&
        this._gold >= goldCost
      ) {
        return true;
      }
    }
    return false;
  }

  private hasOpsReady(): boolean {
    if (this.game?.config().disablePaths()) return false;
    if (this._activeProject !== null) return false;
    if (this._currentTick < this._projectCooldownUntilTick) return false;
    for (const def of this.getDisplayedProjects()) {
      if (
        isProjectUnlocked(this._progress, def.id) &&
        this._science >= def.scienceCost &&
        this._gold >= def.goldCost
      ) {
        return true;
      }
    }
    return false;
  }

  private renderStabilityPanel() {
    if (this._openPanel !== "stability" || !this._breakdown) {
      return nothing;
    }
    const b = this._breakdown;
    const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);
    const rowColor = (n: number) =>
      n > 0 ? "text-emerald-400" : n < 0 ? "text-rose-400" : "text-slate-400";

    const myPlayer = this.game?.myPlayer() ?? null;
    const ownedTiles = myPlayer?.numTilesOwned() ?? 0;
    const unintegrated = myPlayer?.unintegratedTiles() ?? 0;

    const rows: Array<[string, number]> = [
      [translateText("crownfall.factor_base"), b.base],
      [translateText("crownfall.factor_tax"), b.tax],
      [translateText("crownfall.factor_services"), b.publicServices],
      [translateText("crownfall.factor_housing"), b.housing],
      ...(this.game?.config().disableFood()
        ? []
        : ([[translateText("crownfall.factor_food"), b.food]] as Array<
            [string, number]
          >)),
      [translateText("crownfall.factor_war"), b.warStrain],
      [translateText("crownfall.factor_expansion"), b.overexpansion],
      ...(b.fiscalDeficit !== 0
        ? ([[translateText("crownfall.factor_fiscal"), b.fiscalDeficit]] as Array<
            [string, number]
          >)
        : []),
      [translateText("crownfall.factor_development"), b.development],
    ];

    return html`
      <div
        class="${this.popoverPositionClass(
          "narrow",
        )} rounded-2xl border border-[#d4af37]/40 bg-[#080b12]/98 p-4 text-sm text-slate-200 shadow-[0_20px_56px_rgba(0,0,0,0.9)] backdrop-blur-md z-50"
      >
        <div
          class="flex items-center justify-between border-b border-white/10 pb-2.5 mb-2.5 font-bold text-[#f3d27a]"
        >
          <span>${translateText("crownfall.stability_breakdown")}</span>
          <span class="text-slate-300"
            >${translateText("crownfall.stability_target")}: ${b.target}%</span
          >
        </div>
        <div class="space-y-1.5 text-xs">
          ${rows.map(
            ([label, val]) => html`
              <div class="flex items-center justify-between">
                <span class="text-[#9aa3b2]">${label}</span>
                <span class="font-mono font-semibold ${rowColor(val)}"
                  >${label === translateText("crownfall.factor_base")
                    ? `${val}`
                    : fmt(val)}</span
                >
              </div>
            `,
          )}
          <div
            class="flex items-center justify-between border-t border-white/10 pt-1.5 text-[11px] text-[#9aa3b2]"
          >
            <span>Admin Capacity</span>
            <span
              class="font-mono ${ownedTiles > b.adminCapacity
                ? "text-amber-300 font-semibold"
                : "text-slate-300"}"
            >
              ${renderNumber(ownedTiles)} / ${renderNumber(b.adminCapacity)}
              ${unintegrated > 0
                ? `(${renderNumber(unintegrated)} new)`
                : ""}
            </span>
          </div>
        </div>
      </div>
    `;
  }

  private renderFoodPanel() {
    if (this._openPanel !== "food" || !this._foodBreakdown) {
      return nothing;
    }
    const f = this._foodBreakdown;
    const netSign = f.netPerMin > 0 ? `+${f.netPerMin}` : `${f.netPerMin}`;
    const netColor =
      f.netPerMin > 0
        ? "text-emerald-400"
        : f.netPerMin < 0
          ? "text-rose-400"
          : "text-slate-300";
    const statusLabel = translateText(`crownfall.food_status_${f.status}`);
    return html`
      <div
        class="${this.popoverPositionClass(
          "narrow",
        )} rounded-xl border border-amber-400/40 bg-[#080b12]/96 p-3.5 text-xs text-slate-200 shadow-[0_20px_56px_rgba(0,0,0,0.9)] backdrop-blur-md z-50"
      >
        <div
          class="flex items-center justify-between border-b border-white/10 pb-2 mb-2 font-bold text-[#f3d27a]"
        >
          <span>${translateText("crownfall.food_panel_title")}</span>
          <span class="text-[11px] uppercase tracking-wider text-slate-300"
            >${statusLabel}</span
          >
        </div>
        <div class="space-y-1.5 text-xs">
          <div class="flex items-center justify-between">
            <span class="text-[#9aa3b2]">Reserves / Storage</span>
            <span class="font-mono font-semibold text-white"
              >${renderNumber(f.reserves)} / ${renderNumber(f.maxStorage)}</span
            >
          </div>
          <div class="flex items-center justify-between">
            <span class="text-[#9aa3b2]">Production</span>
            <span class="font-mono font-semibold text-emerald-400"
              >+${f.productionPerMin}/min</span
            >
          </div>
          ${f.tradeNetPerMin !== 0
            ? html`<div class="flex items-center justify-between">
                <span class="text-[#9aa3b2]">Net Trade</span>
                <span
                  class="font-mono font-semibold ${f.tradeNetPerMin > 0
                    ? "text-sky-300"
                    : "text-amber-300"}"
                  >${f.tradeNetPerMin > 0
                    ? `+${f.tradeNetPerMin}`
                    : f.tradeNetPerMin}/min</span
                >
              </div>`
            : nothing}
          <div class="flex items-center justify-between">
            <span class="text-[#9aa3b2]">Civilian Consumption</span>
            <span class="font-mono font-semibold text-rose-400"
              >-${f.consumptionPerMin}/min</span
            >
          </div>
          <div class="flex items-center justify-between border-t border-white/10 pt-1.5">
            <span class="text-[#f4f1ea] font-semibold">Net Balance</span>
            <span class="font-mono font-bold ${netColor}">${netSign}/min</span>
          </div>
        </div>
      </div>
    `;
  }

  private renderBountyPanel() {
    if (
      this._openPanel !== "bounty" ||
      !this._activeBounty ||
      this.game.config().disableBounties()
    ) {
      return nothing;
    }
    const b = this._activeBounty;
    const myPlayer = this.game.myPlayer();
    const isMe = myPlayer !== null && myPlayer.id() === b.targetID;
    const mins = Math.floor(b.secondsRemaining / 60);
    const secs = `${b.secondsRemaining % 60}`.padStart(2, "0");
    const targetView =
      b.targetID !== null
        ? (this.game.playerViews().find((p) => p.id() === b.targetID) ?? null)
        : null;
    const foodEnabled = !this.game.config().disableFood();
    const rewardPool = [
      "Gold Jackpot",
      "Troop Reinforcements",
      "Civilian Boom",
      ...(foodEnabled ? ["Food Reserves"] : []),
      "Science Boost",
      "45s Military Efficiency",
      "45s Economic Advantage",
    ];

    return html`
      <div
        class="${this.popoverPositionClass(
          "narrow",
        )} rounded-xl border border-rose-500/45 bg-[#080b12]/96 p-3.5 text-xs text-slate-200 shadow-[0_20px_56px_rgba(0,0,0,0.9)] backdrop-blur-md z-50"
      >
        <div
          class="flex items-center justify-between border-b border-white/10 pb-2 mb-2 font-bold text-rose-300"
        >
          <span>Global Bounty Event</span>
          <span class="font-mono text-amber-300">${mins}:${secs}</span>
        </div>
        <div class="space-y-2 text-xs">
          <div class="flex items-center justify-between gap-2">
            <div>
              <div class="text-[10.5px] uppercase tracking-wider text-[#9aa3b2]">
                Target Nation
              </div>
              <div class="font-bold text-white flex items-center gap-1.5">
                <span>${b.targetName}</span>
                ${isMe
                  ? html`<span
                      class="rounded bg-rose-500/30 px-1.5 py-0.5 text-[10px] font-extrabold text-rose-200"
                      >YOU</span
                    >`
                  : nothing}
              </div>
            </div>
            ${targetView
              ? html`<button
                  type="button"
                  @click=${() =>
                    this.eventBus.emit(new GoToPlayerEvent(targetView))}
                  class="rounded-md border border-rose-400/50 bg-rose-500/20 px-2.5 py-1 text-[11px] font-bold text-rose-200 hover:bg-rose-500/30 cursor-pointer"
                >
                  Locate
                </button>`
              : nothing}
          </div>
          <div class="border-t border-white/10 pt-2">
            <div class="text-[10.5px] uppercase tracking-wider text-[#9aa3b2] mb-1">
              1 Random Elimination Reward
            </div>
            <div class="flex flex-wrap gap-1">
              ${rewardPool.map(
                (label) => html`<span
                  class="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10.5px] text-slate-200"
                  >${label}</span
                >`,
              )}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderBuildingCard(
    entry: BuildingMenuEntry,
    myPlayer: PlayerView,
    accent: "civic" | "arsenal",
  ) {
    if (this.game.config().isUnitDisabled(entry.unitType)) return nothing;
    const cost = this.unitCost(entry.unitType);
    const sciCost = this.unitScienceCost(entry.unitType);
    const canAfford = this.canBuildUnit(entry.unitType);
    const selected = this._ghostStructure === entry.unitType;
    const count = entry.counted
      ? myPlayer.totalUnitLevels(entry.unitType)
      : null;
    const missingPrereq =
      entry.prereqUnit !== undefined &&
      myPlayer.units(entry.prereqUnit).length === 0;
    const reqResearch = requiredResearchLevels(entry.unitType);
    const haveResearch =
      reqResearch > 0
        ? completedStructureLevels(myPlayer, UnitType.ResearchCentre)
        : 0;
    const missingResearch = reqResearch > 0 && haveResearch < reqResearch;

    const affordableBorder =
      accent === "arsenal"
        ? "border-rose-400/40 bg-[#14111a] hover:border-rose-300/75 hover:bg-[#1c1524]"
        : "border-emerald-400/35 bg-[#101622] hover:border-[#d4af37]/65 hover:bg-[#161e2e]";

    return html`
      <button
        type="button"
        @click=${() => this.selectBuildingForPlacement(entry.unitType)}
        ?disabled=${!canAfford && !selected}
        class="group relative flex items-center gap-2 rounded-lg border p-2 text-left transition-all ${
          selected
            ? "border-[#f3d27a] bg-[#d4af37]/20 shadow-[0_0_12px_rgba(212,175,55,0.28)] cursor-pointer"
            : canAfford
              ? `${affordableBorder} cursor-pointer`
              : "border-white/[0.06] bg-[#0c1018]/75 opacity-55 cursor-not-allowed"
        }"
      >
        <div
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-[#080b12]"
        >
          <img
            src=${entry.icon}
            alt=""
            class="h-5 w-5 object-contain"
            draggable="false"
          />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-1">
            <span class="truncate text-[11px] font-bold text-[#f4f1ea]">
              ${translateText(entry.labelKey)}
            </span>
            ${
              count !== null
                ? html`<span
                    class="shrink-0 rounded bg-white/[0.08] px-1 py-0.5 text-[10px] font-mono text-[#e5e1d8]"
                  >
                    ${count}
                  </span>`
                : nothing
            }
          </div>
          <div class="text-[10px] leading-tight text-[#9aa3b2] line-clamp-1">
            ${
              missingResearch
                ? html`<span class="text-amber-300/95 font-semibold"
                    >Needs ${reqResearch} Research (${haveResearch}/${reqResearch})</span
                  >`
                : missingPrereq && entry.prereqKey
                  ? html`<span class="text-amber-300/90 font-medium"
                      >${translateText(entry.prereqKey)}</span
                    >`
                  : translateText(entry.roleKey)
            }
          </div>
          <div class="mt-0.5 flex items-center justify-between gap-1">
            ${
              sciCost > 0
                ? html`<span
                    class="inline-flex items-center gap-1 text-[11px] font-bold tabular-nums ${
                      canAfford ? "text-sky-300" : "text-rose-300/80"
                    }"
                  >
                    ${sciCost} SCI
                  </span>`
                : html`<span
                    class="inline-flex items-center gap-1 text-[11px] font-bold tabular-nums ${
                      canAfford ? "text-[#f3d27a]" : "text-rose-300/80"
                    }"
                  >
                    <img src=${goldCoinIcon} width="10" height="10" alt="" />
                    ${renderNumber(cost)}
                  </span>`
            }
            ${
              entry.hotkey
                ? html`<span
                    class="text-[9px] font-mono text-[#9aa3b2]/75 border border-white/10 rounded px-1"
                  >
                    ${entry.hotkey}
                  </span>`
                : nothing
            }
          </div>
        </div>
      </button>
    `;
  }

  private renderBuildingsPanel() {
    if (this._openPanel !== "buildings") return nothing;
    const myPlayer = this.game?.myPlayer();
    if (!myPlayer) return nothing;
    const costPercent = myPlayer.pathModifiers().structureCostPercent;

    return html`
      <div
        class="${this.popoverPositionClass(
          "medium",
        )} rounded-xl border border-[#d4af37]/40 bg-[#080b12]/96 p-3.5 text-xs text-slate-200 shadow-[0_20px_56px_rgba(0,0,0,0.9)] backdrop-blur-md z-50"
      >
        <div
          class="flex items-center justify-between border-b border-white/10 pb-2 mb-2.5"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-bold tracking-wider uppercase text-[#f3d27a]">
              ${translateText("crownfall.hud.buildings_title")}
            </span>
            ${
              costPercent < 100
                ? html`<span
                    class="rounded border border-emerald-400/40 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300"
                  >
                    −${100 - costPercent}% Cost
                  </span>`
                : nothing
            }
          </div>
          <button
            type="button"
            @click=${() => this.togglePanel("buildings")}
            class="text-slate-400 hover:text-white px-1.5 text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[40dvh] overflow-y-auto pr-1">
          ${CIVIC_BUILDINGS.map((b) =>
            this.renderBuildingCard(b, myPlayer, "civic"),
          )}
        </div>
      </div>
    `;
  }

  private renderArsenalPanel() {
    if (this._openPanel !== "arsenal") return nothing;
    const myPlayer = this.game?.myPlayer();
    if (!myPlayer) return nothing;
    const costPercent = myPlayer.pathModifiers().structureCostPercent;

    return html`
      <div
        class="${this.popoverPositionClass(
          "medium",
        )} rounded-xl border border-rose-500/45 bg-[#080b12]/96 p-3.5 text-xs text-slate-200 shadow-[0_20px_56px_rgba(0,0,0,0.9)] backdrop-blur-md z-50"
      >
        <div
          class="flex items-center justify-between border-b border-white/10 pb-2 mb-2.5"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-bold tracking-wider uppercase text-rose-300">
              ${translateText("crownfall.hud.arsenal_title")}
            </span>
            ${
              costPercent < 100
                ? html`<span
                    class="rounded border border-emerald-400/40 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300"
                  >
                    −${100 - costPercent}% Cost
                  </span>`
                : nothing
            }
          </div>
          <button
            type="button"
            @click=${() => this.togglePanel("arsenal")}
            class="text-slate-400 hover:text-white px-1.5 text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[40dvh] overflow-y-auto pr-1">
          ${MILITARY_BUILDINGS.map((b) =>
            this.renderBuildingCard(b, myPlayer, "arsenal"),
          )}
        </div>
      </div>
    `;
  }

  private renderPathsPanel() {
    if (this._openPanel !== "paths") {
      return nothing;
    }
    const myPlayer = this.game?.myPlayer();
    const mods = myPlayer?.pathModifiers();
    const primary = this._progress.primaryPath;
    const taxButtons: Array<{ rate: TaxRate; labelKey: string }> = [
      { rate: TaxRate.Low, labelKey: "crownfall.tax_low" },
      { rate: TaxRate.Normal, labelKey: "crownfall.tax_normal" },
      { rate: TaxRate.High, labelKey: "crownfall.tax_high" },
    ];

    return html`
      <div
        class="${this.popoverPositionClass(
          "medium",
        )} rounded-xl border border-[#d4af37]/40 bg-[#080b12]/96 p-3 text-xs text-slate-200 shadow-[0_20px_56px_rgba(0,0,0,0.9)] backdrop-blur-md z-50"
      >
        <div
          class="flex items-center justify-between gap-2 border-b border-white/10 pb-2 mb-2.5"
        >
          <span class="text-xs font-bold tracking-wider uppercase text-[#f3d27a]">
            ${translateText("crownfall.paths_title")}
          </span>

          <div class="flex items-center gap-2">
            <span class="text-[10px] uppercase tracking-wider text-[#9aa3b2]">
              ${translateText("crownfall.tax_label")}
            </span>
            <div
              class="inline-flex rounded-md border border-white/10 bg-[#101622] p-0.5"
            >
              ${taxButtons.map(
                ({ rate, labelKey }) => html`
                  <button
                    type="button"
                    @click=${() => this.setTaxRate(rate)}
                    class="px-2 py-0.5 rounded text-[11px] font-semibold transition cursor-pointer ${this
                      ._taxRate === rate
                      ? "bg-[#d4af37] text-[#080b12] shadow-sm"
                      : "text-slate-300 hover:text-[#f3d27a]"}"
                  >
                    ${translateText(labelKey)}
                  </button>
                `,
              )}
            </div>
            <button
              type="button"
              @click=${() => this.togglePanel("paths")}
              class="text-slate-400 hover:text-white px-1 text-sm cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        ${mods ? nothing : nothing}

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 max-h-[42dvh] overflow-y-auto pr-0.5">
          ${ALL_PATHS.map(({ path, icon, accentBorder, accentText, pipBg }) => {
            const level = pathLevelFor(this._progress, path);
            const maxTier = maxTierForPath(primary, path);
            const isPrimary = primary === path;
            const tiers = DEV_PATH_TIERS[path];
            const nextTierDef = tiers[level];
            const sciCost = nextTierScienceCost(this._progress, path);
            const goldCost = nextTierGoldCost(this._progress, path);
            const canAfford =
              sciCost !== null &&
              goldCost !== null &&
              this._science >= sciCost &&
              this._gold >= goldCost;
            const cappedSecondary =
              primary !== null && !isPrimary && level >= maxTier;

            return html`
              <div
                class="flex flex-col justify-between rounded-lg border p-2.5 bg-[#101622] ${isPrimary
                  ? `${accentBorder} ring-1 ring-[#d4af37]/35`
                  : "border-white/10"}"
              >
                <div>
                  <div class="flex items-center justify-between gap-1 mb-1.5">
                    <div class="flex items-center gap-1.5 min-w-0 font-bold text-xs ${accentText}">
                      <img src=${icon} class="w-4 h-4 shrink-0" alt="" />
                      <span class="truncate">${translateText(`crownfall.path.${path}.name`)}</span>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                      ${isPrimary
                        ? html`<span
                            class="rounded bg-[#d4af37]/20 border border-[#d4af37]/40 px-1 py-0.5 text-[9px] font-bold uppercase text-[#f3d27a]"
                            >★</span
                          >`
                        : nothing}
                      <span class="text-[10px] font-mono text-[#9aa3b2]">
                        T${level}/${maxTier}
                      </span>
                    </div>
                  </div>

                  <div class="flex items-center gap-1 mb-2">
                    ${[1, 2, 3, 4].map((t) => {
                      const unlocked = level >= t;
                      const lockedSecondary =
                        primary !== null && !isPrimary && t > maxTier;
                      return html`<div
                        class="h-1.5 flex-1 rounded-full ${unlocked
                          ? pipBg
                          : lockedSecondary
                            ? "bg-slate-800/50 border border-slate-700/40"
                            : "bg-slate-700/70"}"
                      ></div>`;
                    })}
                  </div>

                  <div class="mb-2 space-y-1">
                    ${tiers.map((tDef) => {
                      const isUnlocked = level >= tDef.tier;
                      const isNext =
                        !cappedSecondary && nextTierDef?.tier === tDef.tier;
                      const isLockedSec =
                        primary !== null && !isPrimary && tDef.tier > maxTier;
                      return html`
                        <div
                          title="${translateText(tDef.proKey)} | ${translateText(tDef.conKey)}"
                          class="rounded px-1.5 py-0.5 text-[10.5px] leading-snug ${
                            isUnlocked
                              ? "bg-emerald-500/15 text-emerald-300 font-semibold"
                              : isNext
                                ? "bg-white/[0.06] text-white font-semibold border border-[#d4af37]/30"
                                : isLockedSec
                                  ? "text-slate-500 line-through"
                                  : "text-slate-400"
                          }"
                        >
                          <div class="truncate">
                            ${isUnlocked ? "✓" : `T${tDef.tier} ·`}
                            ${translateText(tDef.nameKey)}
                          </div>
                          ${isNext
                            ? html`<div class="text-[9.5px] font-normal text-emerald-300/90 line-clamp-1 mt-0.5">
                                ${formatProText(translateText(tDef.proKey))}
                              </div>`
                            : nothing}
                        </div>
                      `;
                    })}
                  </div>

                  ${nextTierDef && !cappedSecondary
                    ? nothing
                    : html`
                        <div class="mb-2 text-[10px] text-slate-300 italic">
                          ${cappedSecondary
                            ? translateText("crownfall.paths_secondary_cap")
                            : translateText("crownfall.paths_maxed")}
                        </div>
                      `}
                </div>

                <div class="space-y-1">
                  ${primary === null
                    ? html`
                        <button
                          type="button"
                          @click=${() => this.selectPrimaryPath(path)}
                          class="w-full rounded border border-[#d4af37]/50 bg-[#d4af37]/15 hover:bg-[#d4af37]/25 py-1 text-[10.5px] font-semibold text-[#f3d27a] transition cursor-pointer"
                        >
                          ${translateText("crownfall.paths_set_primary")}
                        </button>
                      `
                    : nothing}
                  ${sciCost !== null && goldCost !== null
                    ? html`
                        <button
                          type="button"
                          ?disabled=${!canAfford}
                          @click=${() => this.unlockTier(path)}
                          class="w-full rounded py-1.5 px-1.5 text-[10.5px] font-bold whitespace-nowrap transition ${canAfford
                            ? "bg-[#d4af37] hover:bg-[#f3d27a] text-[#080b12] shadow-[0_0_10px_rgba(212,175,55,0.3)] cursor-pointer"
                            : "bg-slate-800 text-slate-400 cursor-not-allowed"}"
                        >
                          Unlock · ${sciCost} SCI · ${renderNumber(goldCost)}
                        </button>
                      `
                    : nothing}
                </div>
              </div>
            `;
          })}
        </div>
      </div>
    `;
  }

  private getDisplayedProjects(): readonly NationalProjectDefinition[] {
    const myPlayer = this.game?.myPlayer();
    const seedKey = `${this.game?.gameID?.() ?? "match"}:${myPlayer?.id() ?? "p"}`;
    return rollMatchOperations(seedKey, this._progress.primaryPath);
  }

  private renderOpsPanel() {
    if (this._openPanel !== "ops") {
      return nothing;
    }
    const cooldownSec = Math.max(
      0,
      Math.ceil((this._projectCooldownUntilTick - this._currentTick) / 10),
    );
    const activeSec = Math.max(
      0,
      Math.ceil((this._activeProjectExpiresTick - this._currentTick) / 10),
    );
    const displayedProjects = this.getDisplayedProjects();
    const primaryPath = this._progress.primaryPath;

    return html`
      <div
        class="${this.popoverPositionClass(
          "medium",
        )} rounded-xl border border-[#d4af37]/40 bg-[#080b12]/96 p-3 text-xs text-slate-200 shadow-[0_20px_56px_rgba(0,0,0,0.9)] backdrop-blur-md z-50"
      >
        <div
          class="flex items-center justify-between gap-2 border-b border-white/10 pb-2 mb-2.5"
        >
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-xs font-bold tracking-wider uppercase text-[#f3d27a]">
              ${translateText("crownfall.ops_title")}
            </span>
            <span class="text-[10.5px] text-[#9aa3b2] truncate">
              ${
                primaryPath !== null
                  ? `${translateText(`crownfall.path.${primaryPath}.name`)} · Randomized (${displayedProjects.length})`
                  : `Randomized Match Pool (${displayedProjects.length})`
              }
            </span>
          </div>

          <button
            type="button"
            @click=${() => this.togglePanel("ops")}
            class="text-slate-400 hover:text-white px-1 text-sm cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[42dvh] overflow-y-auto pr-1">
          ${displayedProjects.map((def) => {
            const unlocked = isProjectUnlocked(this._progress, def.id);
            const isActive = this._activeProject === def.id;
            const onCooldown =
              !isActive && this._currentTick < this._projectCooldownUntilTick;
            const canAfford =
              unlocked &&
              this._activeProject === null &&
              !onCooldown &&
              this._science >= def.scienceCost &&
              this._gold >= def.goldCost;

            const pathShort =
              def.requiredPath === DevelopmentPath.Military
                ? "MIL"
                : def.requiredPath === DevelopmentPath.Political
                  ? "POL"
                  : "SCI";

            const pathBadgeColor =
              def.requiredPath === DevelopmentPath.Military
                ? "text-rose-300 border-rose-500/35 bg-rose-500/10"
                : def.requiredPath === DevelopmentPath.Political
                  ? "text-amber-300 border-amber-400/35 bg-amber-400/10"
                  : "text-sky-300 border-sky-400/35 bg-sky-400/10";

            const costParts: string[] = [];
            if (def.scienceCost > 0) costParts.push(`${def.scienceCost} SCI`);
            if (def.goldCost > 0n)
              costParts.push(`${renderNumber(def.goldCost)}`);

            return html`
              <div
                class="flex flex-col justify-between rounded-lg border p-2.5 bg-[#101622] ${isActive
                  ? "border-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.28)]"
                  : unlocked
                    ? "border-[#d4af37]/40"
                    : "border-white/10 opacity-75"}"
              >
                <div>
                  <div class="flex items-center justify-between gap-1.5 mb-1">
                    <div class="flex items-center gap-1.5 min-w-0">
                      <img
                        src=${PROJECT_ICONS[def.id]}
                        alt=""
                        class="w-4 h-4 shrink-0 object-contain"
                      />
                      <span class="font-bold text-[11.5px] text-[#f3d27a] truncate">
                        ${translateText(def.nameKey)}
                      </span>
                    </div>
                    <span
                      class="shrink-0 rounded border px-1 py-0.5 text-[9.5px] font-bold uppercase ${pathBadgeColor}"
                    >
                      ${pathShort} T${def.requiredTier} · ${Math.round(def.durationTicks / 10)}s
                    </span>
                  </div>
                  <div class="text-[10.5px] leading-snug text-emerald-400 line-clamp-2">
                    ${formatProText(translateText(def.proKey))}
                  </div>
                  <div class="text-[10px] leading-snug text-rose-400/95 line-clamp-1 mb-2 mt-0.5">
                    ${formatConText(translateText(def.conKey))}
                  </div>
                </div>

                <div>
                  ${isActive
                    ? html`<div
                        class="w-full text-center rounded py-1 text-[10.5px] font-bold bg-emerald-500/20 border border-emerald-400/50 text-emerald-300"
                      >
                        ${translateText("crownfall.ops_active", {
                          sec: activeSec,
                        })}
                      </div>`
                    : !unlocked
                      ? html`<div
                          class="w-full text-center rounded py-1 text-[10.5px] font-semibold bg-slate-800/80 text-slate-300"
                        >
                          ${translateText("crownfall.ops_locked", {
                            path: translateText(
                              `crownfall.path.${def.requiredPath}.name`,
                            ),
                            tier: def.requiredTier,
                          })}
                        </div>`
                      : onCooldown
                        ? html`<div
                            class="w-full text-center rounded py-1 text-[10.5px] font-semibold bg-slate-800/80 text-[#f3d27a]/85"
                          >
                            ${translateText("crownfall.ops_cooldown", {
                              sec: cooldownSec,
                            })}
                          </div>`
                        : html`<button
                            type="button"
                            ?disabled=${!canAfford}
                            @click=${() => this.activateProject(def.id)}
                            class="w-full rounded py-1 text-[10.5px] font-bold transition ${canAfford
                              ? "bg-[#d4af37] hover:bg-[#f3d27a] text-[#080b12] shadow-[0_0_10px_rgba(212,175,55,0.3)] cursor-pointer"
                              : "bg-slate-800 text-slate-400 cursor-not-allowed"}"
                          >
                            ${translateText("crownfall.ops_activate")} ·
                            ${costParts.join(" · ")}
                          </button>`}
                </div>
              </div>
            `;
          })}
        </div>
      </div>
    `;
  }

  private renderAlliancesPanel() {
    if (this._openPanel !== "alliances") return nothing;
    const myPlayer = this.game?.myPlayer();
    if (!myPlayer) return nothing;

    const alliancesDisabled = this.game.config().disableAlliances();
    const tradeDisabled = this.game.config().disableTrade();
    const foodDisabled = this.game.config().disableFood();
    const allPlayers = this.game.playerViews();

    const allies = allPlayers.filter(
      (p) => p !== myPlayer && p.isAlive() && myPlayer.isFriendly(p),
    );
    const tradeAgreements = tradeDisabled ? [] : myPlayer.tradeAgreements();
    const incomingTradeReqs = tradeDisabled
      ? []
      : myPlayer.incomingTradeRequests();
    const tradedPartnerIDs = new Set<string>(
      tradeAgreements.map((t) =>
        t.proposerID === myPlayer.id() ? t.partnerID : t.proposerID,
      ),
    );
    const tradeCandidates = tradeDisabled
      ? []
      : allPlayers
          .filter(
            (p) =>
              p !== myPlayer &&
              p.isAlive() &&
              p.type() !== PlayerType.Bot &&
              !tradedPartnerIDs.has(p.id()) &&
              (myPlayer.isFriendly(p) || this._borderSmallIDs.has(p.smallID())),
          )
          .slice(0, 6);
    const allianceMap = new Map(
      myPlayer.alliances().map((a) => [a.other, a] as const),
    );

    const incomingProposals = alliancesDisabled
      ? []
      : allPlayers.filter(
          (p) =>
            p !== myPlayer &&
            p.isAlive() &&
            !myPlayer.isFriendly(p) &&
            p.isRequestingAllianceWith(myPlayer),
        );

    const canDonateGoldHuman = this.game.config().gameConfig().donateGold;
    const canDonateTroopsHuman = this.game.config().gameConfig().donateTroops;

    return html`
      <div
        class="${this.popoverPositionClass(
          "medium",
        )} rounded-2xl border border-[#d4af37]/40 bg-[#080b12]/98 p-4 text-sm text-slate-200 shadow-[0_24px_70px_rgba(0,0,0,0.92)] backdrop-blur-md z-50"
      >
        <div
          class="flex items-center justify-between border-b border-white/10 pb-2.5 mb-3"
        >
          <div>
            <span class="text-sm font-bold tracking-wider uppercase text-[#f3d27a]">
              ${tradeDisabled ? "Alliances" : "Alliances & Trade"}
            </span>
            <span class="ml-2 text-xs text-[#9aa3b2]">
              Allies: ${allies.length}${tradeDisabled
                ? ""
                : ` · Trades: ${tradeAgreements.length}/${CROWNFALL_TRADE_CONFIG.maxActiveAgreementsPerPlayer}`}
            </span>
          </div>
          <button
            type="button"
            @click=${() => this.togglePanel("alliances")}
            class="text-slate-400 hover:text-white px-1.5 text-base cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div class="space-y-3 max-h-[45dvh] overflow-y-auto pr-1">
          <!-- Incoming Allied Pact Requests (Troops/Gold/Joint Attack) -->
          ${
            this._incomingActionRequests.length > 0
              ? html`
                  <div class="space-y-2">
                    <div class="text-xs font-bold uppercase tracking-wider text-amber-300">
                      Incoming Allied Requests (${this._incomingActionRequests.length})
                    </div>
                    ${this._incomingActionRequests.map((req) => {
                      const sender = this.game.playerBySmallID(
                        req.requestorID,
                      ) as PlayerView | null;
                      const senderName = sender?.displayName?.() ?? "Ally";
                      const targetName =
                        req.targetID !== null
                          ? ((
                              this.game.playerBySmallID(
                                req.targetID,
                              ) as PlayerView | null
                            )?.displayName?.() ?? "")
                          : "";
                      const secLeft = Math.max(
                        0,
                        Math.ceil((req.expiresAt - this._currentTick) / 10),
                      );
                      const label =
                        req.actionType === AllianceActionType.JointAttack &&
                        targetName
                          ? `${senderName} requests Joint Attack on ${targetName}`
                          : `${senderName}: ${translateText(`crownfall.alliance.label_${req.actionType}`)}`;

                      return html`
                        <div
                          class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/45 bg-amber-500/10 px-3.5 py-2.5"
                        >
                          <div class="text-xs font-semibold text-amber-100">
                            ${label}
                            <span class="ml-1.5 font-mono text-amber-300"
                              >(${secLeft}s)</span
                            >
                          </div>
                          <div class="flex items-center gap-2">
                            <button
                              type="button"
                              @click=${() => {
                                this.eventBus?.emit(
                                  new SendAllianceActionReplyIntentEvent(
                                    req.requestID,
                                    true,
                                  ),
                                );
                                this._incomingActionRequests =
                                  this._incomingActionRequests.filter(
                                    (r) => r.requestID !== req.requestID,
                                  );
                              }}
                              class="rounded-lg bg-emerald-500 hover:bg-emerald-400 px-3 py-1 text-xs font-bold text-[#080b12] cursor-pointer"
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              @click=${() => {
                                this.eventBus?.emit(
                                  new SendAllianceActionReplyIntentEvent(
                                    req.requestID,
                                    false,
                                  ),
                                );
                                this._incomingActionRequests =
                                  this._incomingActionRequests.filter(
                                    (r) => r.requestID !== req.requestID,
                                  );
                              }}
                              class="rounded-lg border border-rose-400/40 bg-rose-500/15 hover:bg-rose-500/25 px-3 py-1 text-xs font-semibold text-rose-200 cursor-pointer"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      `;
                    })}
                  </div>
                `
              : nothing
          }

          <!-- Incoming Alliance Proposals -->
          ${
            incomingProposals.length > 0
              ? html`
                  <div class="space-y-2">
                    <div class="text-xs font-bold uppercase tracking-wider text-emerald-300">
                      Incoming Alliance Proposals (${incomingProposals.length})
                    </div>
                    ${incomingProposals.map(
                      (p) => html`
                        <div
                          class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3.5 py-2.5"
                        >
                          <div>
                            <div class="text-sm font-bold text-white">
                              ${p.displayName()}
                            </div>
                            <div class="text-xs text-slate-300 font-mono">
                              Troops: ${renderTroops(p.troops())} · Gold:
                              ${renderNumber(p.gold())}
                            </div>
                          </div>
                          <div class="flex items-center gap-2">
                            <button
                              type="button"
                              @click=${() =>
                                this.eventBus?.emit(new GoToPlayerEvent(p))}
                              class="rounded-lg border border-white/15 bg-[#171f2e] px-2.5 py-1 text-xs font-semibold text-slate-200 cursor-pointer"
                            >
                              Locate
                            </button>
                            <button
                              type="button"
                              @click=${() =>
                                this.eventBus?.emit(
                                  new SendAllianceRequestIntentEvent(
                                    myPlayer,
                                    p,
                                  ),
                                )}
                              class="rounded-lg bg-emerald-500 hover:bg-emerald-400 px-3 py-1 text-xs font-bold text-[#080b12] cursor-pointer"
                            >
                              Accept Pact
                            </button>
                            <button
                              type="button"
                              @click=${() =>
                                this.eventBus?.emit(
                                  new SendAllianceRejectIntentEvent(p),
                                )}
                              class="rounded-lg border border-rose-400/40 bg-rose-500/15 hover:bg-rose-500/25 px-2.5 py-1 text-xs font-semibold text-rose-200 cursor-pointer"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      `,
                    )}
                  </div>
                `
              : nothing
          }

          <!-- Active Allies & Full Pact Controls -->
          <div>
            <div class="mb-2 text-xs font-semibold uppercase tracking-widest text-[#9aa3b2]">
              Active Allies &amp; Trade / War Coordination
            </div>
            ${
              allies.length === 0
                ? html`
                    <div
                      class="rounded-xl border border-white/[0.07] bg-[#101622] p-4 text-center text-[#9aa3b2]"
                    >
                      <div class="text-sm font-semibold text-[#f4f1ea] mb-1">
                        ${
                          alliancesDisabled
                            ? "Alliances Disabled in Match Settings"
                            : "No Active Alliances Yet"
                        }
                      </div>
                      <div class="text-xs leading-relaxed">
                        ${
                          alliancesDisabled
                            ? "Custom match settings disabled diplomatic alliances for this game."
                            : "Propose a pact to any nation below (or right-click on the map) to unlock Troops-for-Gold deals, emergency subsidies, defensive aid, and joint offensives."
                        }
                      </div>
                    </div>
                  `
                : html`
                    <div class="space-y-3">
                      ${allies.map((ally) => {
                        const allianceView = allianceMap.get(ally.id());
                        const isTeammate = myPlayer.isOnSameTeam(ally);
                        const pactSecLeft = allianceView
                          ? Math.max(
                              0,
                              Math.ceil(
                                (allianceView.expiresAt - this._currentTick) /
                                  10,
                              ),
                            )
                          : null;
                        const canRenew = Boolean(
                          allianceView?.hasExtensionRequest,
                        );
                        const outgoing = this._outgoingActionByAlly.get(
                          ally.id(),
                        );
                        const awaitingSec =
                          outgoing && outgoing.expiresAt > this._currentTick
                            ? Math.ceil(
                                (outgoing.expiresAt - this._currentTick) / 10,
                              )
                            : 0;
                        const cooldownSec =
                          outgoing &&
                          awaitingSec === 0 &&
                          outgoing.cooldownUntil > this._currentTick
                            ? Math.ceil(
                                (outgoing.cooldownUntil - this._currentTick) /
                                  10,
                              )
                            : 0;
                        const actionBusy = awaitingSec > 0 || cooldownSec > 0;

                        const canDirectDonateGold =
                          (ally.type() !== PlayerType.Human ||
                            canDonateGoldHuman) &&
                          myPlayer.gold() > 0n;
                        const canDirectDonateTroops =
                          (ally.type() !== PlayerType.Human ||
                            canDonateTroopsHuman) &&
                          myPlayer.troops() > 100;



                        return html`
                          <div
                            class="rounded-xl border border-white/10 bg-[#101622] p-3.5 space-y-2.5"
                          >
                            <!-- Header row -->
                            <div
                              class="flex flex-wrap items-center justify-between gap-2"
                            >
                              <div class="min-w-0">
                                <div class="flex items-center gap-2">
                                  <span
                                    class="text-sm font-bold text-[#f4f1ea] truncate"
                                  >
                                    ${ally.displayName()}
                                  </span>
                                  <span
                                    class="rounded bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-300"
                                  >
                                    ${
                                      isTeammate
                                        ? "Teammate"
                                        : ally.type() === PlayerType.Human
                                          ? "Player Ally"
                                          : "AI Ally"
                                    }
                                  </span>
                                  ${
                                    pactSecLeft !== null
                                      ? html`<span
                                          class="text-[11px] font-mono ${
                                            pactSecLeft <= 30
                                              ? "text-amber-300 font-bold"
                                              : "text-[#9aa3b2]"
                                          }"
                                        >
                                          ⏱ ${pactSecLeft}s
                                        </span>`
                                      : nothing
                                  }
                                </div>
                                <div
                                  class="text-xs text-[#9aa3b2] tabular-nums mt-0.5"
                                >
                                  Troops: ${renderTroops(ally.troops())} · Gold:
                                  ${renderNumber(ally.gold())}
                                </div>
                              </div>

                              <div class="flex flex-wrap items-center gap-1.5">
                                ${
                                  awaitingSec > 0
                                    ? html`<span
                                        class="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/50 bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-200"
                                      >
                                        <span
                                          class="h-2 w-2 rounded-full bg-amber-300 animate-ping"
                                        ></span>
                                        Awaiting reply (${awaitingSec}s)
                                      </span>`
                                    : cooldownSec > 0
                                      ? html`<span
                                          class="rounded-lg border border-white/10 bg-slate-800/80 px-2.5 py-1 text-[11px] font-mono text-slate-300"
                                        >
                                          Next pact in ${cooldownSec}s
                                        </span>`
                                      : nothing
                                }
                                ${
                                  canRenew
                                    ? html`<button
                                        type="button"
                                        @click=${() =>
                                          this.eventBus?.emit(
                                            new SendAllianceExtensionIntentEvent(
                                              ally,
                                            ),
                                          )}
                                        class="rounded-lg bg-emerald-500 hover:bg-emerald-400 px-2.5 py-1 text-xs font-bold text-[#080b12] cursor-pointer"
                                      >
                                        Renew Pact
                                      </button>`
                                    : nothing
                                }
                                <button
                                  type="button"
                                  @click=${() =>
                                    this.eventBus?.emit(
                                      new GoToPlayerEvent(ally),
                                    )}
                                  class="rounded-lg border border-white/15 bg-[#171f2e] hover:border-[#d4af37]/50 px-2.5 py-1 text-xs font-semibold text-[#f4f1ea] cursor-pointer"
                                >
                                  Locate
                                </button>
                                ${
                                  !isTeammate
                                    ? html`<button
                                        type="button"
                                        @click=${() =>
                                          this.eventBus?.emit(
                                            new SendBreakAllianceIntentEvent(
                                              myPlayer,
                                              ally,
                                            ),
                                          )}
                                        class="rounded-lg border border-rose-500/35 bg-rose-500/10 hover:bg-rose-500/20 px-2.5 py-1 text-xs font-semibold text-rose-300 cursor-pointer"
                                      >
                                        Break
                                      </button>`
                                    : nothing
                                }
                              </div>
                            </div>

                            <!-- Action Buttons Grid: Trades, Aid, Donations -->
                            <div
                              class="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1"
                            >
                              <button
                                type="button"
                                ?disabled=${
                                  actionBusy ||
                                  this._gold <
                                    CROWNFALL_ALLIANCE_CONFIG.troopsForGoldMinPayment
                                }
                                @click=${() =>
                                  this.eventBus?.emit(
                                    new SendAllianceActionRequestIntentEvent(
                                      ally.id(),
                                      AllianceActionType.TroopsForGold,
                                      null,
                                    ),
                                  )}
                                title="Pay 50K–100K Gold to purchase 25% of this ally's troops"
                                class="rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${
                                  !actionBusy &&
                                  this._gold >=
                                    CROWNFALL_ALLIANCE_CONFIG.troopsForGoldMinPayment
                                    ? "border-[#d4af37]/50 bg-[#d4af37]/15 hover:bg-[#d4af37]/25 text-[#f3d27a] cursor-pointer"
                                    : "border-white/5 bg-slate-800/50 text-slate-500 cursor-not-allowed"
                                }"
                              >
                                Buy Troops (${
                                  this._gold >= 100_000n ? "100K" : "50K"
                                } Gold)
                              </button>

                              <button
                                type="button"
                                ?disabled=${
                                  actionBusy ||
                                  myPlayer.troops() <
                                    CROWNFALL_ALLIANCE_CONFIG.goldForTroopsMinTroops
                                }
                                @click=${() =>
                                  this.eventBus?.emit(
                                    new SendAllianceActionRequestIntentEvent(
                                      ally.id(),
                                      AllianceActionType.GoldForTroops,
                                      null,
                                    ),
                                  )}
                                title="Send 20% of your troops in exchange for 50K–100K allied Gold"
                                class="rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${
                                  !actionBusy &&
                                  myPlayer.troops() >=
                                    CROWNFALL_ALLIANCE_CONFIG.goldForTroopsMinTroops
                                    ? "border-amber-400/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 cursor-pointer"
                                    : "border-white/5 bg-slate-800/50 text-slate-500 cursor-not-allowed"
                                }"
                              >
                                Troops → Gold
                              </button>

                              <button
                                type="button"
                                ?disabled=${actionBusy}
                                @click=${() =>
                                  this.eventBus?.emit(
                                    new SendAllianceActionRequestIntentEvent(
                                      ally.id(),
                                      AllianceActionType.Reinforcements,
                                      null,
                                    ),
                                  )}
                                class="rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                                  !actionBusy
                                    ? "border-emerald-400/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-200 cursor-pointer"
                                    : "border-white/5 bg-slate-800/50 text-slate-500 cursor-not-allowed"
                                }"
                              >
                                Request Troops
                              </button>

                              <button
                                type="button"
                                ?disabled=${actionBusy}
                                @click=${() =>
                                  this.eventBus?.emit(
                                    new SendAllianceActionRequestIntentEvent(
                                      ally.id(),
                                      AllianceActionType.GoldAid,
                                      null,
                                    ),
                                  )}
                                class="rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                                  !actionBusy
                                    ? "border-sky-400/40 bg-sky-500/10 hover:bg-sky-500/20 text-sky-200 cursor-pointer"
                                    : "border-white/5 bg-slate-800/50 text-slate-500 cursor-not-allowed"
                                }"
                              >
                                Request Gold
                              </button>

                              <button
                                type="button"
                                ?disabled=${actionBusy}
                                @click=${() =>
                                  this.eventBus?.emit(
                                    new SendAllianceActionRequestIntentEvent(
                                      ally.id(),
                                      AllianceActionType.DefenseAid,
                                      null,
                                    ),
                                  )}
                                class="rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                                  !actionBusy
                                    ? "border-indigo-400/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-200 cursor-pointer"
                                    : "border-white/5 bg-slate-800/50 text-slate-500 cursor-not-allowed"
                                }"
                              >
                                Defense Aid
                              </button>

                              <div class="flex items-center gap-1">
                                <button
                                  type="button"
                                  ?disabled=${!canDirectDonateGold}
                                  @click=${() =>
                                    this.eventBus?.emit(
                                      new SendDonateGoldIntentEvent(ally, null),
                                    )}
                                  title="Gift Gold directly to this ally"
                                  class="flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition ${
                                    canDirectDonateGold
                                      ? "border-white/15 bg-[#171f2e] hover:border-[#d4af37]/50 text-[#f3d27a] cursor-pointer"
                                      : "border-white/5 bg-slate-800/50 text-slate-500 cursor-not-allowed"
                                  }"
                                >
                                  Gift Gold
                                </button>
                                <button
                                  type="button"
                                  ?disabled=${!canDirectDonateTroops}
                                  @click=${() =>
                                    this.eventBus?.emit(
                                      new SendDonateTroopsIntentEvent(
                                        ally,
                                        null,
                                      ),
                                    )}
                                  title="Gift Troops directly to this ally"
                                  class="flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition ${
                                    canDirectDonateTroops
                                      ? "border-white/15 bg-[#171f2e] hover:border-emerald-400/50 text-emerald-200 cursor-pointer"
                                      : "border-white/5 bg-slate-800/50 text-slate-500 cursor-not-allowed"
                                  }"
                                >
                                  Gift Troops
                                </button>
                              </div>
                            </div>
                        </div>
                      `;
                      })}
                    </div>
                  `
            }
          </div>

          ${
            !tradeDisabled
              ? html`
                  <div class="border-t border-white/10 pt-2.5 space-y-2.5">
                    ${
                      incomingTradeReqs.length > 0
                        ? html`
                            <div class="space-y-1.5">
                              <div class="text-[11px] font-bold uppercase tracking-wider text-sky-300">
                                Incoming Trade Proposals (${incomingTradeReqs.length})
                              </div>
                              ${incomingTradeReqs.map((req) => {
                                const sender = allPlayers.find(
                                  (p) => p.id() === req.proposerID,
                                );
                                const sName = sender?.displayName() ?? "Nation";
                                return html`
                                  <div
                                    class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-400/40 bg-sky-500/10 px-3 py-1.5"
                                  >
                                    <span class="text-xs font-semibold text-sky-100">
                                      ${sName}:
                                      ${translateText(
                                        `crownfall.trade.type_${req.tradeType}`,
                                      )}
                                    </span>
                                    <div class="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        @click=${() =>
                                          this.eventBus?.emit(
                                            new SendTradeReplyIntentEvent(
                                              req.id,
                                              true,
                                            ),
                                          )}
                                        class="rounded bg-emerald-500 hover:bg-emerald-400 px-2.5 py-0.5 text-[11px] font-bold text-[#080b12] cursor-pointer"
                                      >
                                        Accept
                                      </button>
                                      <button
                                        type="button"
                                        @click=${() =>
                                          this.eventBus?.emit(
                                            new SendTradeReplyIntentEvent(
                                              req.id,
                                              false,
                                            ),
                                          )}
                                        class="rounded border border-rose-400/40 bg-rose-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-rose-200 cursor-pointer"
                                      >
                                        Decline
                                      </button>
                                    </div>
                                  </div>
                                `;
                              })}
                            </div>
                          `
                        : nothing
                    }

                    <div>
                      <div class="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-[#9aa3b2]">
                        Active Trade Agreements (${tradeAgreements.length}/${CROWNFALL_TRADE_CONFIG.maxActiveAgreementsPerPlayer})
                      </div>
                      ${
                        tradeAgreements.length === 0
                          ? html`<div class="text-xs text-slate-400 italic">
                              No active trade agreements. Propose a pact to any neighbour or ally below.
                            </div>`
                          : html`
                              <div class="space-y-1.5">
                                ${tradeAgreements.map((agr) => {
                                  const otherID =
                                    agr.proposerID === myPlayer.id()
                                      ? agr.partnerID
                                      : agr.proposerID;
                                  const partner = allPlayers.find(
                                    (p) => p.id() === otherID,
                                  );
                                  const pName =
                                    partner?.displayName() ?? "Partner";
                                  const myP = effectivePartnerPath(
                                    myPlayer.primaryPath(),
                                    myPlayer.type(),
                                    myPlayer.smallID(),
                                  );
                                  const theirP = partner
                                    ? effectivePartnerPath(
                                        partner.primaryPath(),
                                        partner.type(),
                                        partner.smallID(),
                                      )
                                    : null;
                                  const canCancel =
                                    this._currentTick - agr.createdAt >=
                                    CROWNFALL_TRADE_CONFIG.minAgreementDurationTicks;
                                  return html`
                                    <div
                                      class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#101622] px-3 py-1.5"
                                    >
                                      <div class="flex flex-wrap items-center gap-2 text-xs">
                                        <span class="font-bold text-white"
                                          >${pName}</span
                                        >
                                        <span class="text-sky-300 font-semibold">
                                          ${translateText(
                                            `crownfall.trade.type_${agr.tradeType}`,
                                          )}
                                        </span>
                                        ${
                                          myP && theirP
                                            ? html`<span
                                                class="rounded bg-[#d4af37]/15 border border-[#d4af37]/35 px-1.5 py-0.5 text-[10px] font-mono text-[#f3d27a]"
                                              >
                                                ${myP.slice(0, 3).toUpperCase()} ⇄
                                                ${theirP.slice(0, 3).toUpperCase()}
                                              </span>`
                                            : nothing
                                        }
                                      </div>
                                      <button
                                        type="button"
                                        ?disabled=${!canCancel}
                                        @click=${() =>
                                          this.eventBus?.emit(
                                            new SendTradeCancelIntentEvent(
                                              agr.id,
                                            ),
                                          )}
                                        class="rounded border px-2 py-0.5 text-[10.5px] font-semibold ${
                                          canCancel
                                            ? "border-rose-500/35 bg-rose-500/10 text-rose-300 cursor-pointer"
                                            : "border-white/5 bg-slate-800/60 text-slate-500 cursor-not-allowed"
                                        }"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  `;
                                })}
                              </div>
                            `
                      }
                    </div>

                    ${
                      tradeAgreements.length <
                        CROWNFALL_TRADE_CONFIG.maxActiveAgreementsPerPlayer &&
                      tradeCandidates.length > 0
                        ? html`
                            <div>
                              <div class="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-[#9aa3b2]">
                                Neighbours &amp; Allies — Propose Trade
                              </div>
                              <div class="space-y-1.5">
                                ${tradeCandidates.map((cand) => {
                                  const candPath = effectivePartnerPath(
                                    cand.primaryPath(),
                                    cand.type(),
                                    cand.smallID(),
                                  );
                                  return html`
                                    <div
                                      class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#101622] px-2.5 py-1.5"
                                    >
                                      <div class="flex items-center gap-1.5 min-w-0">
                                        <span class="text-xs font-bold text-[#f4f1ea] truncate">
                                          ${cand.displayName()}
                                        </span>
                                        ${
                                          candPath
                                            ? html`<span
                                                class="rounded bg-white/[0.07] px-1 py-0.5 text-[9.5px] uppercase text-slate-300"
                                              >
                                                ${candPath.slice(0, 3)}
                                              </span>`
                                            : nothing
                                        }
                                      </div>
                                      <div class="flex flex-wrap items-center gap-1">
                                        ${
                                          !foodDisabled
                                            ? html`
                                                <button
                                                  type="button"
                                                  @click=${() =>
                                                    this.eventBus?.emit(
                                                      new SendTradeRequestIntentEvent(
                                                        cand.id(),
                                                        TradeAgreementType.ImportFood,
                                                      ),
                                                    )}
                                                  class="rounded border border-lime-400/40 bg-lime-500/10 hover:bg-lime-500/20 px-2 py-0.5 text-[10.5px] font-semibold text-lime-200 cursor-pointer"
                                                >
                                                  Import Food
                                                </button>
                                                <button
                                                  type="button"
                                                  @click=${() =>
                                                    this.eventBus?.emit(
                                                      new SendTradeRequestIntentEvent(
                                                        cand.id(),
                                                        TradeAgreementType.ExportFood,
                                                      ),
                                                    )}
                                                  class="rounded border border-amber-400/40 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 text-[10.5px] font-semibold text-amber-200 cursor-pointer"
                                                >
                                                  Export Food
                                                </button>
                                              `
                                            : nothing
                                        }
                                        <button
                                          type="button"
                                          @click=${() =>
                                            this.eventBus?.emit(
                                              new SendTradeRequestIntentEvent(
                                                cand.id(),
                                                TradeAgreementType.CommercePact,
                                              ),
                                            )}
                                          class="rounded border border-[#d4af37]/45 bg-[#d4af37]/15 hover:bg-[#d4af37]/25 px-2 py-0.5 text-[10.5px] font-semibold text-[#f3d27a] cursor-pointer"
                                        >
                                          Commerce
                                        </button>
                                        <button
                                          type="button"
                                          @click=${() =>
                                            this.eventBus?.emit(
                                              new SendTradeRequestIntentEvent(
                                                cand.id(),
                                                TradeAgreementType.ResearchPact,
                                              ),
                                            )}
                                          class="rounded border border-sky-400/40 bg-sky-500/10 hover:bg-sky-500/20 px-2 py-0.5 text-[10.5px] font-semibold text-sky-200 cursor-pointer"
                                        >
                                          Research
                                        </button>
                                      </div>
                                    </div>
                                  `;
                                })}
                              </div>
                            </div>
                          `
                        : nothing
                    }
                  </div>
                `
              : nothing
          }

        </div>
      </div>
    `;
  }

  render() {
    if (!this._visible) {
      return nothing;
    }

    const band = stabilityBand(this._stability);
    const bandColor =
      band === "stable"
        ? "text-emerald-400 border-emerald-500/45 bg-emerald-950/55"
        : band === "unrest"
          ? "text-amber-300 border-amber-500/45 bg-amber-950/55"
          : band === "crisis"
            ? "text-orange-400 border-orange-500/55 bg-orange-950/55"
            : "text-rose-400 border-rose-500/55 bg-rose-950/65";

    const target = this._breakdown?.target ?? this._stability;
    const trend =
      target > this._stability ? "↑" : target < this._stability ? "↓" : "•";
    const trendColor =
      target > this._stability
        ? "text-emerald-400"
        : target < this._stability
          ? "text-rose-400"
          : "text-slate-400";

    const pathsEnabled = !(this.game?.config().disablePaths() ?? false);
    const placingArsenal =
      this._ghostStructure !== null &&
      MILITARY_UNIT_SET.has(this._ghostStructure);
    const placingCivic =
      this._ghostStructure !== null && !placingArsenal;
    const ghostLabelKey =
      this._ghostStructure !== null
        ? BUILDING_LABEL_BY_TYPE.get(this._ghostStructure)
        : undefined;

    const showBuildingsDot =
      this._showDots &&
      this._buildingsAlert &&
      this._openPanel !== "buildings";
    const showArsenalDot =
      this._showDots &&
      this._arsenalAlert &&
      this._openPanel !== "arsenal";
    const showPathsDot =
      pathsEnabled &&
      this._showDots &&
      this.hasPathActionAvailable() &&
      this._openPanel !== "paths";
    const showOpsDot =
      pathsEnabled &&
      this._showDots &&
      this.hasOpsReady() &&
      this._openPanel !== "ops";
    const showAlliancesDot =
      this._showDots &&
      (this._alliancesAlert ||
        this._incomingActionRequests.length > 0 ||
        (this.game?.myPlayer()?.incomingTradeRequests().length ?? 0) > 0) &&
      this._openPanel !== "alliances";

    const isSideRail =
      this._hudPosition === "left" || this._hudPosition === "right";

    const activeSec =
      this._activeProject !== null
        ? Math.max(
            0,
            Math.ceil((this._activeProjectExpiresTick - this._currentTick) / 10),
          )
        : 0;

    const menuTabClass = (panel: OpenHudMenu, activeSpecial = false) =>
      `relative inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] sm:text-xs font-semibold tracking-wide transition cursor-pointer ${
        activeSpecial
          ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
          : this._openPanel === panel
            ? "border-[#f3d27a] bg-[#d4af37] text-[#080b12] shadow-[0_0_10px_rgba(212,175,55,0.3)]"
            : "border-white/15 bg-[#101622] text-[#f4f1ea] hover:border-[#d4af37]/60 hover:text-[#f3d27a]"
      }`;

    const dockGridClass = isSideRail
      ? "grid grid-cols-2 gap-1.5"
      : pathsEnabled
        ? "grid grid-cols-3 sm:grid-cols-5 gap-1.5"
        : "grid grid-cols-3 gap-1.5";

    return html`
      <div
        class="relative border-t border-white/[0.08] px-2.5 py-1.5 text-xs text-slate-100 select-none"
      >
        <!-- Live Diplomatic Reply Toast Banner (removed — notifications appear in bottom-right events panel) -->

        ${this.renderStabilityPanel()} ${this.renderFoodPanel()}
        ${this.renderBountyPanel()} ${this.renderBuildingsPanel()}
        ${this.renderArsenalPanel()} ${this.renderPathsPanel()}
        ${this.renderOpsPanel()} ${this.renderAlliancesPanel()}

        <!-- Top Strip: Compact National Vitals -->
        <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
          <div class="flex flex-wrap items-center gap-3">
            <!-- Civilians -->
            <div
              class="flex items-center gap-1"
              title="${translateText("crownfall.civilians_tooltip")}"
            >
              <span class="text-[#f3d27a] font-bold text-[11px] tracking-wider">
                ${translateText("crownfall.civilians_short")}
              </span>
              <span class="font-mono font-bold text-xs text-white">
                ${renderNumber(this._civilians)}
              </span>
              <span class="text-[11px] text-[#9aa3b2] font-mono">
                /${renderNumber(this._civilianCap)}
              </span>
            </div>

            <!-- Food Reserves & Net Rate -->
            ${
              this._foodBreakdown !== null
                ? html`<button
                    type="button"
                    @click=${() => this.togglePanel("food")}
                    class="flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition hover:brightness-110 cursor-pointer ${
                      this._foodBreakdown.status === "famine"
                        ? "border-rose-500/60 bg-rose-950/70 text-rose-300 animate-pulse"
                        : this._foodBreakdown.status === "shortage"
                          ? "border-amber-500/50 bg-amber-950/55 text-amber-300"
                          : "border-lime-500/35 bg-lime-950/40 text-lime-300"
                    }"
                    title="${translateText("crownfall.food_tooltip")}"
                  >
                    <span class="font-bold text-[10.5px] tracking-wider">FOOD</span>
                    <span class="font-mono font-bold text-white"
                      >${renderNumber(this._foodBreakdown.reserves)}</span
                    >
                    <span
                      class="font-mono text-[10.5px] font-semibold ${
                        this._foodBreakdown.netPerMin >= 0
                          ? "text-lime-300"
                          : "text-amber-300"
                      }"
                    >
                      ${this._foodBreakdown.netPerMin >= 0
                        ? `+${this._foodBreakdown.netPerMin}/m`
                        : `${this._foodBreakdown.netPerMin}/m`}
                    </span>
                  </button>`
                : nothing
            }

            <!-- Stability -->
            <button
              type="button"
              @click=${() => this.togglePanel("stability")}
              class="flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition hover:brightness-110 cursor-pointer ${bandColor}"
              title="${translateText("crownfall.stability_tooltip")}"
            >
              <span class="font-bold">${this._stability}%</span>
              <span class="text-[10px] uppercase tracking-wider font-semibold">
                ${translateText(`crownfall.band_${band}`)}
              </span>
              <span class="font-bold ${trendColor}">${trend}</span>
            </button>

            ${this._inFiscalDeficit
              ? html`<div
                  class="flex items-center gap-1 rounded-md border border-amber-500/60 bg-amber-950/70 px-2 py-0.5 text-[10.5px] font-bold text-amber-200 animate-pulse"
                  title="${translateText("crownfall.fiscal_deficit_warning")}"
                >
                  <span>DEFICIT</span>
                </div>`
              : nothing}

            ${this._rebellionMeter > 0
              ? html`<div
                  class="flex items-center gap-1 rounded-md border border-red-500/60 bg-red-600/20 px-2 py-0.5 text-[11px] font-bold text-red-200 ${this
                    ._rebellionMeter >= 50
                    ? "animate-pulse"
                    : ""}"
                  title="${translateText("crownfall.rebellion_risk_tooltip")}"
                >
                  <span>${translateText("crownfall.rebellion_risk_badge")}</span>
                  <span class="font-mono">${this._rebellionMeter}%</span>
                </div>`
              : nothing}

            <!-- Science -->
            <div
              class="flex items-center gap-1"
              title="${translateText("crownfall.science_tooltip")}"
            >
              <span class="text-sky-300 font-bold text-[11px] tracking-wider">
                ${translateText("crownfall.science_short")}
              </span>
              <span class="font-mono font-bold text-xs text-sky-100">
                ${renderNumber(this._science)}
              </span>
              ${this._scienceRate > 0
                ? html`<span class="text-[11px] font-semibold text-sky-400"
                    >+${this._scienceRate}/s</span
                  >`
                : nothing}
            </div>
          </div>

          <!-- Active Operation / Placement Status Chips -->
          <div class="flex flex-wrap items-center gap-2">
            ${
              this._activeBounty !== null &&
              !this.game.config().disableBounties()
                ? html`<div
                    class="inline-flex items-center gap-1 rounded-lg border border-rose-500/60 bg-rose-950/75 px-2 py-0.5 text-xs font-bold text-rose-200"
                  >
                    <button
                      type="button"
                      @click=${() => this.togglePanel("bounty")}
                      class="inline-flex items-center gap-1 cursor-pointer hover:text-white"
                      title="Click for Global Bounty details & reward pool"
                    >
                      <span class="text-rose-400">BOUNTY</span>
                      <span class="text-white max-w-[110px] truncate"
                        >${this._activeBounty.targetName}</span
                      >
                      ${this.game.myPlayer()?.id() ===
                      this._activeBounty.targetID
                        ? html`<span
                            class="rounded bg-rose-500/35 px-1 text-[10px] font-extrabold text-rose-100 animate-pulse"
                            >YOU</span
                          >`
                        : nothing}
                      <span class="font-mono text-amber-300"
                        >${Math.floor(
                          this._activeBounty.secondsRemaining / 60,
                        )}:${`${this._activeBounty.secondsRemaining % 60}`.padStart(
                          2,
                          "0",
                        )}</span
                      >
                    </button>
                    ${(() => {
                      const targetView =
                        this._activeBounty?.targetID !== null
                          ? (this.game
                              .playerViews()
                              .find(
                                (p) => p.id() === this._activeBounty?.targetID,
                              ) ?? null)
                          : null;
                      return targetView
                        ? html`<button
                            type="button"
                            @click=${() =>
                              this.eventBus.emit(
                                new GoToPlayerEvent(targetView),
                              )}
                            class="ml-0.5 rounded bg-rose-500/25 px-1.5 py-0.2 text-[10.5px] font-semibold text-rose-100 hover:bg-rose-500/40 cursor-pointer"
                          >
                            Locate
                          </button>`
                        : nothing;
                    })()}
                  </div>`
                : nothing
            }
            ${
              this._activeProject !== null
                ? html`<div
                    class="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/60 bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-200"
                  >
                    <span class="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
                    <span
                      >${translateText(
                        NATIONAL_PROJECTS_BY_ID[this._activeProject].nameKey,
                      )}
                      · ${activeSec}s</span
                    >
                  </div>`
                : nothing
            }
            ${
              this._ghostStructure !== null
                ? html`<button
                    type="button"
                    @click=${() => this.cancelPlacement()}
                    class="inline-flex items-center gap-1.5 rounded-lg border border-[#f3d27a] bg-[#d4af37]/20 px-2.5 py-0.5 text-xs font-bold text-[#f3d27a] cursor-pointer"
                  >
                    <span
                      >Placing:
                      ${ghostLabelKey
                        ? translateText(ghostLabelKey)
                        : this._ghostStructure}</span
                    >
                    <span class="opacity-80">✕</span>
                  </button>`
                : nothing
            }
          </div>
        </div>

        <!-- Bottom Strip: 5 Sovereign Menu Buttons (Buildings, Arsenal, Paths, Operations, Alliances) -->
        <div class=${dockGridClass}>
          <button
            type="button"
            data-hud-menu="buildings"
            @click=${() => this.togglePanel("buildings")}
            class="justify-center ${menuTabClass("buildings", placingCivic)}"
          >
            <span>Buildings</span>
            ${showBuildingsDot ? renderRedDot() : nothing}
          </button>

          <button
            type="button"
            data-hud-menu="arsenal"
            @click=${() => this.togglePanel("arsenal")}
            class="justify-center ${menuTabClass("arsenal", placingArsenal)}"
          >
            <span>Arsenal</span>
            ${showArsenalDot ? renderRedDot() : nothing}
          </button>

          ${
            pathsEnabled
              ? html`
                  <button
                    type="button"
                    data-hud-menu="paths"
                    @click=${() => this.togglePanel("paths")}
                    class="justify-center ${menuTabClass("paths")}"
                  >
                    <span>Paths</span>
                    ${showPathsDot ? renderRedDot() : nothing}
                  </button>

                  <button
                    type="button"
                    data-hud-menu="ops"
                    @click=${() => this.togglePanel("ops")}
                    class="justify-center ${menuTabClass(
                      "ops",
                      this._activeProject !== null,
                    )}"
                  >
                    <span>Operations</span>
                    ${showOpsDot ? renderRedDot() : nothing}
                  </button>
                `
              : nothing
          }

          <button
            type="button"
            data-hud-menu="alliances"
            @click=${() => this.togglePanel("alliances")}
            class="justify-center ${
              isSideRail && pathsEnabled ? "col-span-2" : ""
            } ${menuTabClass("alliances")}"
          >
            <span>Alliances</span>
            ${
              this._allyCount > 0
                ? html`<span
                    class="rounded-full bg-[#d4af37]/25 px-1.5 py-0.2 text-[11px] font-bold text-[#f3d27a]"
                  >
                    ${this._allyCount}
                  </span>`
                : nothing
            }
            ${showAlliancesDot ? renderRedDot() : nothing}
          </button>
        </div>
      </div>
    `;
  }
}
