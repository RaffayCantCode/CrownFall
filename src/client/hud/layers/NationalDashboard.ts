import {
  AllianceActionType,
  AugmentId,
  BuildableUnit,
  BuildMenus,
  DevelopmentPath,
  Gold,
  NationalProject,
  PlayerBuildableUnitType,
  TaxRate,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { getAugmentDefinition } from "@openfront/engine-lib/configuration/CrownfallAugments";
import {
  computeStabilityBreakdown,
  maxCivilianPopulation,
  sciencePerSecond,
  stabilityBand,
  type StabilityBreakdown,
} from "@openfront/engine-lib/configuration/CrownfallConfig";
import {
  DEV_PATH_TIERS,
  maxTierForPath,
  nextTierScienceCost,
  pathLevelFor,
  type PathProgress,
} from "@openfront/engine-lib/configuration/CrownfallPaths";
import {
  ALL_NATIONAL_PROJECTS,
  isProjectUnlocked,
  NATIONAL_PROJECTS_BY_ID,
} from "@openfront/engine-lib/configuration/CrownfallProjects";
import { renderNumber } from "@openfront/engine-lib/Format";
import { assetUrl } from "@openfront/shared/AssetUrls";
import { EventBus } from "@openfront/shared/EventBus";
import { html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { Controller } from "../../Controller";
import type { InputHandler } from "../../InputHandler";
import { GoToPlayerEvent } from "../../TransformHandler";
import {
  SendActivateNationalProjectIntentEvent,
  SendAllianceActionRequestIntentEvent,
  SendBreakAllianceIntentEvent,
  SendSelectDevPathIntentEvent,
  SendSetTaxRateIntentEvent,
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
import { renderAugmentEmblem } from "./CrownfallEmblems";

const militaryPathIcon = assetUrl("images/crownfall/path-military.svg");
const politicalPathIcon = assetUrl("images/crownfall/path-political.svg");
const scientificPathIcon = assetUrl("images/crownfall/path-scientific.svg");
const housingIcon = assetUrl("images/HousingIconWhite.svg");
const publicServicesIcon = assetUrl("images/PublicServicesIconWhite.svg");
const researchCentreIcon = assetUrl("images/ResearchCentreIconWhite.svg");

const PROJECT_ICONS: Record<NationalProject, string> = {
  [NationalProject.SurgeMobilisation]: assetUrl(
    "images/crownfall/ops-mobilisation.svg",
  ),
  [NationalProject.NationalReconciliation]: assetUrl(
    "images/crownfall/ops-reconciliation.svg",
  ),
  [NationalProject.EmpOverdrive]: assetUrl("images/crownfall/ops-emp.svg"),
};

interface BuildingMenuEntry {
  unitType: PlayerBuildableUnitType;
  labelKey: string;
  icon: string;
  hotkey?: string;
  counted: boolean;
}

const CIVIC_BUILDINGS: readonly BuildingMenuEntry[] = [
  {
    unitType: UnitType.City,
    labelKey: "unit_type.city",
    icon: cityIcon,
    hotkey: "1",
    counted: true,
  },
  {
    unitType: UnitType.Factory,
    labelKey: "unit_type.factory",
    icon: factoryIcon,
    hotkey: "2",
    counted: true,
  },
  {
    unitType: UnitType.Port,
    labelKey: "unit_type.port",
    icon: portIcon,
    hotkey: "3",
    counted: true,
  },
  {
    unitType: UnitType.Housing,
    labelKey: "unit_type.housing",
    icon: housingIcon,
    counted: true,
  },
  {
    unitType: UnitType.PublicServices,
    labelKey: "unit_type.public_services",
    icon: publicServicesIcon,
    counted: true,
  },
  {
    unitType: UnitType.ResearchCentre,
    labelKey: "unit_type.research_centre",
    icon: researchCentreIcon,
    counted: true,
  },
];

const MILITARY_BUILDINGS: readonly BuildingMenuEntry[] = [
  {
    unitType: UnitType.DefensePost,
    labelKey: "unit_type.defense_post",
    icon: defensePostIcon,
    hotkey: "4",
    counted: true,
  },
  {
    unitType: UnitType.MissileSilo,
    labelKey: "unit_type.missile_silo",
    icon: missileSiloIcon,
    hotkey: "5",
    counted: true,
  },
  {
    unitType: UnitType.SAMLauncher,
    labelKey: "unit_type.sam_launcher",
    icon: samLauncherIcon,
    hotkey: "6",
    counted: true,
  },
  {
    unitType: UnitType.Warship,
    labelKey: "unit_type.warship",
    icon: warshipIcon,
    hotkey: "7",
    counted: true,
  },
  {
    unitType: UnitType.AtomBomb,
    labelKey: "unit_type.atom_bomb",
    icon: atomBombIcon,
    hotkey: "8",
    counted: false,
  },
  {
    unitType: UnitType.HydrogenBomb,
    labelKey: "unit_type.hydrogen_bomb",
    icon: hydrogenBombIcon,
    hotkey: "9",
    counted: false,
  },
  {
    unitType: UnitType.MIRV,
    labelKey: "unit_type.mirv",
    icon: mirvIcon,
    hotkey: "0",
    counted: false,
  },
];

const ALL_BUILDING_ENTRIES: readonly BuildingMenuEntry[] = [
  ...CIVIC_BUILDINGS,
  ...MILITARY_BUILDINGS,
];

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
  | "buildings"
  | "paths"
  | "ops"
  | "alliances";

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
  @state() private _rebellionMeter = 0;
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
  @state() private _allyCount = 0;
  @state() private _buildingsAlert = false;
  @state() private _openPanel: OpenHudMenu = "none";
  @state() private _hudPosition: HudPosition = new UserSettings().hudPosition();
  @state() private _showDots: boolean = new UserSettings().hudNotificationDots();

  private _playerBuildables: BuildableUnit[] = [];
  private _buildablesRefreshTick = -10;
  private _knownAffordable = new Set<PlayerBuildableUnitType>();
  private _buildablesSeeded = false;

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
          ? "w-80"
          : size === "medium"
            ? "w-[min(calc(100vw-370px),620px)]"
            : "w-[min(calc(100vw-370px),700px)]";
      return `absolute bottom-0 left-full ml-3 ${width}`;
    }
    if (pos === "right") {
      const width =
        size === "narrow"
          ? "w-80"
          : size === "medium"
            ? "w-[min(calc(100vw-370px),620px)]"
            : "w-[min(calc(100vw-370px),700px)]";
      return `absolute bottom-0 right-full mr-3 ${width}`;
    }
    const width =
      size === "narrow"
        ? "left-2 w-80"
        : size === "medium"
          ? "left-1/2 -translate-x-1/2 w-[min(96vw,640px)]"
          : "left-1/2 -translate-x-1/2 w-[min(96vw,740px)]";
    return `absolute bottom-full mb-2.5 ${width}`;
  }

  createRenderRoot() {
    return this;
  }

  init(): void {
    this._visible = false;
    this._openPanel = "none";
    this._playerBuildables = [];
    this._buildablesRefreshTick = -10;
    this._knownAffordable.clear();
    this._buildablesSeeded = false;
    this._buildingsAlert = false;
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

    if (nowTick - this._buildablesRefreshTick >= 5) {
      this._buildablesRefreshTick = nowTick;
      myPlayer
        .buildables(undefined, BuildMenus.types)
        .then((list) => {
          this._playerBuildables = list;
          this.updateBuildingAffordabilityAlert();
          if (this._openPanel === "buildings") {
            this.requestUpdate();
          }
        })
        .catch(() => {});
    } else if (this._buildablesSeeded) {
      this.updateBuildingAffordabilityAlert();
    }

    const civ = myPlayer.civilianPopulation();
    const cap = maxCivilianPopulation(myPlayer);
    const sci = myPlayer.science();
    const stab = myPlayer.stability();
    const reb = myPlayer.rebellionMeter();
    const tax = myPlayer.taxRate();
    const progress = myPlayer.pathProgress();
    const gold = myPlayer.gold();
    const activeProj = myPlayer.activeProject();
    const activeExp = myPlayer.activeProjectExpiresTick();
    const cooldownUntil = myPlayer.projectCooldownUntilTick();
    const selectedAugs = myPlayer.selectedAugments();
    const ghost = this.uiState?.ghostStructure ?? null;
    const alliesCount = myPlayer.alliances().length;
    const mods = myPlayer.pathModifiers();
    const sciRate = sciencePerSecond(myPlayer, civ, stab, mods);
    const breakdown = computeStabilityBreakdown(
      myPlayer,
      tax,
      civ,
      myPlayer.incomingAttacks().length,
      mods,
    );

    if (
      civ !== this._civilians ||
      cap !== this._civilianCap ||
      sci !== this._science ||
      sciRate !== this._scienceRate ||
      stab !== this._stability ||
      reb !== this._rebellionMeter ||
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
      this._civilianCap = cap;
      this._science = sci;
      this._scienceRate = sciRate;
      this._stability = stab;
      this._rebellionMeter = reb;
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

  private updateBuildingAffordabilityAlert(): void {
    if (this._playerBuildables.length === 0) return;

    const currentlyAffordable = new Set<PlayerBuildableUnitType>();
    for (const entry of ALL_BUILDING_ENTRIES) {
      if (this.canBuildUnit(entry.unitType)) {
        currentlyAffordable.add(entry.unitType);
      }
    }

    if (!this._buildablesSeeded) {
      this._buildablesSeeded = true;
      this._knownAffordable = currentlyAffordable;
      if (currentlyAffordable.size > 0 && this._openPanel !== "buildings") {
        this._buildingsAlert = true;
      }
      return;
    }

    let newlyUnlocked = false;
    for (const u of currentlyAffordable) {
      if (!this._knownAffordable.has(u)) {
        newlyUnlocked = true;
        break;
      }
    }
    this._knownAffordable = currentlyAffordable;

    if (currentlyAffordable.size === 0) {
      this._buildingsAlert = false;
    } else if (newlyUnlocked && this._openPanel !== "buildings") {
      this._buildingsAlert = true;
    }
  }

  private unitCost(unitType: UnitType): Gold {
    for (const bu of this._playerBuildables) {
      if (bu.type === unitType) return bu.cost;
    }
    return 0n;
  }

  private canBuildUnit(unitType: PlayerBuildableUnitType): boolean {
    if (!this.game || this.game.config().isUnitDisabled(unitType)) return false;
    if (this._playerBuildables.length === 0) return false;
    const myPlayer = this.game.myPlayer();
    if (!myPlayer) return false;
    const cost = this.unitCost(unitType);
    if (cost <= 0n && !this._playerBuildables.some((b) => b.type === unitType)) {
      return false;
    }
    if (cost > myPlayer.gold()) return false;
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
    const cost = nextTierScienceCost(this._progress, path);
    if (cost === null || this._science < cost) return;
    this.eventBus?.emit(new SendUnlockDevTierIntentEvent(path));
  }

  private togglePanel(panel: OpenHudMenu) {
    const next = this._openPanel === panel ? "none" : panel;
    this._openPanel = next;
    if (next === "buildings") {
      this._buildingsAlert = false;
    }
  }

  private activateProject(project: NationalProject) {
    if (this._activeProject !== null) return;
    if (this._currentTick < this._projectCooldownUntilTick) return;
    if (!isProjectUnlocked(this._progress, project)) return;
    this.eventBus?.emit(new SendActivateNationalProjectIntentEvent(project));
  }

  private hasPathActionAvailable(): boolean {
    if (this._progress.primaryPath === null) return true;
    for (const { path } of ALL_PATHS) {
      const cost = nextTierScienceCost(this._progress, path);
      if (cost !== null && this._science >= cost) {
        return true;
      }
    }
    return false;
  }

  private hasOpsReady(): boolean {
    if (this._activeProject !== null) return false;
    if (this._currentTick < this._projectCooldownUntilTick) return false;
    for (const def of ALL_NATIONAL_PROJECTS) {
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

    const rows: Array<[string, number]> = [
      [translateText("crownfall.factor_base"), b.base],
      [translateText("crownfall.factor_tax"), b.tax],
      [translateText("crownfall.factor_services"), b.publicServices],
      [translateText("crownfall.factor_housing"), b.housing],
      [translateText("crownfall.factor_war"), b.warStrain],
      [translateText("crownfall.factor_expansion"), b.overexpansion],
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
        </div>
      </div>
    `;
  }

  private renderBuildingCard(entry: BuildingMenuEntry, myPlayer: PlayerView) {
    if (this.game.config().isUnitDisabled(entry.unitType)) return nothing;
    const cost = this.unitCost(entry.unitType);
    const canAfford = this.canBuildUnit(entry.unitType);
    const selected = this._ghostStructure === entry.unitType;
    const count = entry.counted
      ? myPlayer.totalUnitLevels(entry.unitType)
      : null;

    return html`
      <button
        type="button"
        @click=${() => this.selectBuildingForPlacement(entry.unitType)}
        ?disabled=${!canAfford && !selected}
        class="group relative flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
          selected
            ? "border-[#f3d27a] bg-[#d4af37]/20 shadow-[0_0_16px_rgba(212,175,55,0.28)] cursor-pointer"
            : canAfford
              ? "border-emerald-400/35 bg-[#101622] hover:border-[#d4af37]/65 hover:bg-[#161e2e] cursor-pointer"
              : "border-white/[0.05] bg-[#0c1018]/70 opacity-45 cursor-not-allowed"
        }"
      >
        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#080b12]"
        >
          <img
            src=${entry.icon}
            alt=""
            class="h-6 w-6 object-contain"
            draggable="false"
          />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-1.5">
            <span class="truncate text-xs font-bold text-[#f4f1ea]">
              ${translateText(entry.labelKey)}
            </span>
            ${
              count !== null
                ? html`<span
                    class="shrink-0 rounded bg-white/[0.08] px-1.5 py-0.5 text-[11px] font-mono text-[#e5e1d8]"
                  >
                    ${count}
                  </span>`
                : nothing
            }
          </div>
          <div class="mt-1 flex items-center justify-between gap-1">
            <span
              class="inline-flex items-center gap-1 text-xs font-bold tabular-nums ${
                canAfford ? "text-[#f3d27a]" : "text-rose-300/80"
              }"
            >
              <img src=${goldCoinIcon} width="11" height="11" alt="" />
              ${renderNumber(cost)}
            </span>
            ${
              entry.hotkey
                ? html`<span
                    class="text-[10px] font-mono text-[#9aa3b2]/75 border border-white/10 rounded px-1.5"
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

    return html`
      <div
        class="${this.popoverPositionClass(
          "wide",
        )} rounded-2xl border border-[#d4af37]/40 bg-[#080b12]/98 p-5 text-sm text-slate-200 shadow-[0_24px_70px_rgba(0,0,0,0.92)] backdrop-blur-md z-50"
      >
        <div
          class="flex items-center justify-between border-b border-white/10 pb-3 mb-3.5"
        >
          <div>
            <span class="text-sm font-bold tracking-wider uppercase text-[#f3d27a]">
              Imperial Construction
            </span>
            <span class="ml-2 text-xs text-[#9aa3b2]">
              Select an affordable structure or weapon, then click the map to place
            </span>
          </div>
          <button
            type="button"
            @click=${() => this.togglePanel("buildings")}
            class="text-slate-400 hover:text-white px-2 py-0.5 text-base cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div class="space-y-4 max-h-[62dvh] overflow-y-auto pr-1">
          <div>
            <div
              class="mb-2 text-xs font-semibold uppercase tracking-widest text-[#9aa3b2]"
            >
              Civic &amp; Economic Infrastructure
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              ${CIVIC_BUILDINGS.map((b) =>
                this.renderBuildingCard(b, myPlayer),
              )}
            </div>
          </div>

          <div>
            <div
              class="mb-2 text-xs font-semibold uppercase tracking-widest text-[#9aa3b2]"
            >
              Military &amp; Strategic Arsenal
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              ${MILITARY_BUILDINGS.map((b) =>
                this.renderBuildingCard(b, myPlayer),
              )}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderPathsPanel() {
    if (this._openPanel !== "paths") {
      return nothing;
    }
    const primary = this._progress.primaryPath;
    const taxButtons: Array<{ rate: TaxRate; labelKey: string }> = [
      { rate: TaxRate.Low, labelKey: "crownfall.tax_low" },
      { rate: TaxRate.Normal, labelKey: "crownfall.tax_normal" },
      { rate: TaxRate.High, labelKey: "crownfall.tax_high" },
    ];

    return html`
      <div
        class="${this.popoverPositionClass(
          "wide",
        )} rounded-2xl border border-[#d4af37]/40 bg-[#080b12]/98 p-5 text-sm text-slate-200 shadow-[0_24px_70px_rgba(0,0,0,0.92)] backdrop-blur-md z-50"
      >
        <div
          class="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3 mb-4"
        >
          <span class="text-sm font-bold tracking-wider uppercase text-[#f3d27a]">
            ${translateText("crownfall.paths_title")}
          </span>

          <!-- Clean Tax Policy Selector housed inside Governance/Paths -->
          <div class="flex items-center gap-2.5">
            <span class="text-xs uppercase tracking-wider text-[#9aa3b2]">
              ${translateText("crownfall.tax_label")} Policy
            </span>
            <div
              class="inline-flex rounded-lg border border-white/10 bg-[#101622] p-0.5"
            >
              ${taxButtons.map(
                ({ rate, labelKey }) => html`
                  <button
                    type="button"
                    @click=${() => this.setTaxRate(rate)}
                    class="px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${this
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
              class="text-slate-400 hover:text-white px-1.5 text-base cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          ${ALL_PATHS.map(({ path, icon, accentBorder, accentText, pipBg }) => {
            const level = pathLevelFor(this._progress, path);
            const maxTier = maxTierForPath(primary, path);
            const isPrimary = primary === path;
            const nextTierDef = DEV_PATH_TIERS[path][level];
            const cost = nextTierScienceCost(this._progress, path);
            const canAfford = cost !== null && this._science >= cost;
            const cappedSecondary =
              primary !== null && !isPrimary && level >= maxTier;

            return html`
              <div
                class="flex flex-col justify-between rounded-xl border p-4 bg-[#101622] ${isPrimary
                  ? `${accentBorder} ring-1 ring-[#d4af37]/35`
                  : "border-white/10"}"
              >
                <div>
                  <div class="flex items-center justify-between gap-1.5 mb-2">
                    <div class="flex items-center gap-2 font-bold text-base ${accentText}">
                      <img src=${icon} class="w-5 h-5" alt="" />
                      <span>${translateText(`crownfall.path.${path}.name`)}</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <span class="text-xs font-mono text-[#9aa3b2]">
                        T${level}/${maxTier}
                      </span>
                      ${isPrimary
                        ? html`<span
                            class="rounded bg-[#d4af37]/20 border border-[#d4af37]/40 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#f3d27a]"
                            >${translateText("crownfall.paths_primary_badge")}</span
                          >`
                        : nothing}
                    </div>
                  </div>

                  <div class="flex items-center gap-1.5 mb-3">
                    ${[1, 2, 3, 4].map((t) => {
                      const unlocked = level >= t;
                      const lockedSecondary =
                        primary !== null && !isPrimary && t > maxTier;
                      return html`<div
                        class="h-2 flex-1 rounded-full ${unlocked
                          ? pipBg
                          : lockedSecondary
                            ? "bg-slate-800/50 border border-slate-700/40"
                            : "bg-slate-700/70"}"
                      ></div>`;
                    })}
                  </div>

                  ${nextTierDef && !cappedSecondary
                    ? html`
                        <div class="mb-3 space-y-1">
                          <div class="font-bold text-sm text-white">
                            Next — T${nextTierDef.tier}:
                            ${translateText(nextTierDef.nameKey)}
                          </div>
                          <div class="text-xs text-emerald-400 leading-snug">
                            ${formatProText(translateText(nextTierDef.proKey))}
                          </div>
                          <div class="text-xs text-rose-400 leading-snug">
                            ${formatConText(translateText(nextTierDef.conKey))}
                          </div>
                        </div>
                      `
                    : html`
                        <div class="mb-3 text-xs text-slate-300 italic">
                          ${cappedSecondary
                            ? translateText("crownfall.paths_secondary_cap")
                            : translateText("crownfall.paths_maxed")}
                        </div>
                      `}
                </div>

                <div class="space-y-1.5">
                  ${primary === null
                    ? html`
                        <button
                          type="button"
                          @click=${() => this.selectPrimaryPath(path)}
                          class="w-full rounded-lg border border-[#d4af37]/50 bg-[#d4af37]/15 hover:bg-[#d4af37]/25 py-1.5 text-xs font-semibold text-[#f3d27a] transition cursor-pointer"
                        >
                          ${translateText("crownfall.paths_set_primary")}
                        </button>
                      `
                    : nothing}
                  ${cost !== null
                    ? html`
                        <button
                          type="button"
                          ?disabled=${!canAfford}
                          @click=${() => this.unlockTier(path)}
                          class="w-full rounded-lg py-2 text-xs font-bold transition ${canAfford
                            ? "bg-[#d4af37] hover:bg-[#f3d27a] text-[#080b12] shadow-[0_0_12px_rgba(212,175,55,0.3)] cursor-pointer"
                            : "bg-slate-800 text-slate-400 cursor-not-allowed"}"
                        >
                          ${translateText("crownfall.paths_unlock")} (${cost}
                          ${translateText("crownfall.science_short")})
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

    return html`
      <div
        class="${this.popoverPositionClass(
          "wide",
        )} rounded-2xl border border-[#d4af37]/40 bg-[#080b12]/98 p-5 text-sm text-slate-200 shadow-[0_24px_70px_rgba(0,0,0,0.92)] backdrop-blur-md z-50"
      >
        <div
          class="flex items-center justify-between border-b border-white/10 pb-3 mb-4"
        >
          <span class="text-sm font-bold tracking-wider uppercase text-[#f3d27a]">
            ${translateText("crownfall.ops_title")}
          </span>
          <button
            type="button"
            @click=${() => this.togglePanel("ops")}
            class="text-slate-400 hover:text-white px-1.5 text-base cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          ${ALL_NATIONAL_PROJECTS.map((def) => {
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

            return html`
              <div
                class="flex flex-col justify-between rounded-xl border p-4 bg-[#101622] ${isActive
                  ? "border-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.28)]"
                  : unlocked
                    ? "border-[#d4af37]/40"
                    : "border-white/10 opacity-80"}"
              >
                <div>
                  <div class="flex items-center gap-2 mb-2">
                    <img
                      src=${PROJECT_ICONS[def.id]}
                      alt=""
                      class="w-5 h-5 object-contain"
                    />
                    <span class="font-bold text-sm text-[#f3d27a]">
                      ${translateText(def.nameKey)}
                    </span>
                  </div>
                  <div class="text-xs leading-snug text-emerald-400 mb-1.5">
                    ${formatProText(translateText(def.proKey))}
                  </div>
                  <div class="text-xs leading-snug text-rose-400 mb-3">
                    ${formatConText(translateText(def.conKey))}
                  </div>
                </div>

                <div>
                  ${isActive
                    ? html`<div
                        class="w-full text-center rounded-lg py-2 text-xs font-bold bg-emerald-500/20 border border-emerald-400/50 text-emerald-300"
                      >
                        ${translateText("crownfall.ops_active", {
                          sec: activeSec,
                        })}
                      </div>`
                    : !unlocked
                      ? html`<div
                          class="w-full text-center rounded-lg py-2 text-xs font-semibold bg-slate-800/80 text-slate-300"
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
                            class="w-full text-center rounded-lg py-2 text-xs font-semibold bg-slate-800/80 text-[#f3d27a]/85"
                          >
                            ${translateText("crownfall.ops_cooldown", {
                              sec: cooldownSec,
                            })}
                          </div>`
                        : html`<button
                            type="button"
                            ?disabled=${!canAfford}
                            @click=${() => this.activateProject(def.id)}
                            class="w-full rounded-lg py-2 text-xs font-bold transition ${canAfford
                              ? "bg-[#d4af37] hover:bg-[#f3d27a] text-[#080b12] shadow-[0_0_12px_rgba(212,175,55,0.3)] cursor-pointer"
                              : "bg-slate-800 text-slate-400 cursor-not-allowed"}"
                          >
                            ${translateText("crownfall.ops_activate")}
                            (${def.scienceCost} SCI ·
                            ${renderNumber(def.goldCost)})
                          </button>`}
                </div>
              </div>
            `;
          })}
        </div>

        <!-- Drafted National Choices Summary -->
        <div
          class="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2"
        >
          <span class="text-xs uppercase tracking-wider text-[#9aa3b2]">
            National Choices (${this._selectedAugments.length} / 5)
          </span>
          <div class="flex flex-wrap items-center gap-2">
            ${
              this._selectedAugments.length === 0
                ? html`<span class="text-xs text-slate-400 italic"
                    >None drafted yet</span
                  >`
                : this._selectedAugments.map((id) => {
                    const def = getAugmentDefinition(id);
                    return html`<span
                      class="inline-flex items-center gap-1.5 rounded-lg border border-[#d4af37]/35 bg-[#101622] px-2.5 py-1 text-xs font-semibold text-[#f3d27a]"
                    >
                      <span
                        class="w-4 h-4 inline-flex items-center justify-center"
                        >${renderAugmentEmblem(id)}</span
                      >
                      ${translateText(def.nameKey)}
                    </span>`;
                  })
            }
          </div>
        </div>
      </div>
    `;
  }

  private renderAlliancesPanel() {
    if (this._openPanel !== "alliances") return nothing;
    const myPlayer = this.game?.myPlayer();
    if (!myPlayer) return nothing;

    const allies = this.game
      .playerViews()
      .filter((p) => p !== myPlayer && p.isAlive() && myPlayer.isAlliedWith(p));

    return html`
      <div
        class="${this.popoverPositionClass(
          "medium",
        )} rounded-2xl border border-[#d4af37]/40 bg-[#080b12]/98 p-5 text-sm text-slate-200 shadow-[0_24px_70px_rgba(0,0,0,0.92)] backdrop-blur-md z-50"
      >
        <div
          class="flex items-center justify-between border-b border-white/10 pb-3 mb-3.5"
        >
          <div>
            <span class="text-sm font-bold tracking-wider uppercase text-[#f3d27a]">
              Alliances &amp; Diplomacy
            </span>
            <span class="ml-2 text-xs text-[#9aa3b2]">
              Active Pacts: ${allies.length}
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

        ${
          allies.length === 0
            ? html`
                <div
                  class="rounded-xl border border-white/[0.07] bg-[#101622] p-5 text-center text-[#9aa3b2]"
                >
                  <div class="text-sm font-semibold text-[#f4f1ea] mb-1">
                    No Active Alliances
                  </div>
                  <div class="text-xs leading-relaxed">
                    Right-click (or open the radial menu on) any neighboring
                    nation on the map to propose a diplomatic alliance. Once
                    allied, you can coordinate reinforcements and joint
                    operations right here.
                  </div>
                </div>
              `
            : html`
                <div class="space-y-2.5 max-h-[50dvh] overflow-y-auto pr-1">
                  ${allies.map(
                    (ally) => html`
                      <div
                        class="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-white/10 bg-[#101622] px-3.5 py-3"
                      >
                        <div class="min-w-0">
                          <div class="text-sm font-semibold text-[#f4f1ea] truncate">
                            ${ally.name()}
                          </div>
                          <div class="text-xs text-[#9aa3b2] tabular-nums">
                            Troops: ${renderNumber(ally.troops())} · Gold:
                            ${renderNumber(ally.gold())}
                          </div>
                        </div>

                        <div class="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            @click=${() => {
                              this.eventBus?.emit(new GoToPlayerEvent(ally));
                            }}
                            class="rounded-lg border border-white/15 bg-[#171f2e] hover:border-[#d4af37]/50 px-3 py-1.5 text-xs font-semibold text-[#f4f1ea] transition cursor-pointer"
                          >
                            Locate
                          </button>
                          <button
                            type="button"
                            @click=${() => {
                              this.eventBus?.emit(
                                new SendAllianceActionRequestIntentEvent(
                                  ally.id(),
                                  AllianceActionType.Reinforcements,
                                  null,
                                ),
                              );
                            }}
                            class="rounded-lg border border-[#d4af37]/45 bg-[#d4af37]/15 hover:bg-[#d4af37]/25 px-3 py-1.5 text-xs font-bold text-[#f3d27a] transition cursor-pointer"
                          >
                            Request Troops
                          </button>
                          <button
                            type="button"
                            @click=${() => {
                              this.eventBus?.emit(
                                new SendBreakAllianceIntentEvent(
                                  myPlayer,
                                  ally,
                                ),
                              );
                            }}
                            class="rounded-lg border border-rose-500/35 bg-rose-500/10 hover:bg-rose-500/20 px-2.5 py-1.5 text-xs font-semibold text-rose-300 transition cursor-pointer"
                          >
                            Break
                          </button>
                        </div>
                      </div>
                    `,
                  )}
                </div>
              `
        }
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

    const showBuildingsDot =
      this._showDots &&
      this._buildingsAlert &&
      this._openPanel !== "buildings";
    const showPathsDot =
      this._showDots &&
      this.hasPathActionAvailable() &&
      this._openPanel !== "paths";
    const showOpsDot =
      this._showDots && this.hasOpsReady() && this._openPanel !== "ops";
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
      `relative inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-xs sm:text-sm font-semibold tracking-wide transition cursor-pointer ${
        activeSpecial
          ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
          : this._openPanel === panel
            ? "border-[#f3d27a] bg-[#d4af37] text-[#080b12] shadow-[0_0_14px_rgba(212,175,55,0.3)]"
            : "border-white/15 bg-[#101622] text-[#f4f1ea] hover:border-[#d4af37]/60 hover:text-[#f3d27a]"
      }`;

    return html`
      <div
        class="relative border-t border-white/[0.08] px-3.5 py-2.5 text-sm text-slate-100 select-none"
      >
        ${this.renderStabilityPanel()} ${this.renderBuildingsPanel()}
        ${this.renderPathsPanel()} ${this.renderOpsPanel()}
        ${this.renderAlliancesPanel()}

        <!-- Top Strip: Larger, Crisp National Vitals -->
        <div class="flex flex-wrap items-center justify-between gap-3 mb-2">
          <div class="flex flex-wrap items-center gap-4">
            <!-- Civilians -->
            <div
              class="flex items-center gap-1.5"
              title="${translateText("crownfall.civilians_tooltip")}"
            >
              <span class="text-[#f3d27a] font-bold text-xs tracking-wider">
                ${translateText("crownfall.civilians_short")}
              </span>
              <span class="font-mono font-bold text-sm text-white">
                ${renderNumber(this._civilians)}
              </span>
              <span class="text-xs text-[#9aa3b2] font-mono">
                /${renderNumber(this._civilianCap)}
              </span>
            </div>

            <!-- Stability -->
            <button
              type="button"
              @click=${() => this.togglePanel("stability")}
              class="flex items-center gap-1.5 rounded-lg border px-2.5 py-0.5 text-sm transition hover:brightness-110 cursor-pointer ${bandColor}"
              title="${translateText("crownfall.stability_tooltip")}"
            >
              <span class="font-bold">${this._stability}%</span>
              <span class="text-xs uppercase tracking-wider font-semibold">
                ${translateText(`crownfall.band_${band}`)}
              </span>
              <span class="font-bold ${trendColor}">${trend}</span>
            </button>

            ${this._rebellionMeter > 0
              ? html`<div
                  class="flex items-center gap-1.5 rounded-lg border border-red-500/60 bg-red-600/20 px-2.5 py-0.5 text-xs font-bold text-red-200 ${this
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
              class="flex items-center gap-1.5"
              title="${translateText("crownfall.science_tooltip")}"
            >
              <span class="text-sky-300 font-bold text-xs tracking-wider">
                ${translateText("crownfall.science_short")}
              </span>
              <span class="font-mono font-bold text-sm text-sky-100">
                ${renderNumber(this._science)}
              </span>
              ${this._scienceRate > 0
                ? html`<span class="text-xs font-semibold text-sky-400"
                    >+${this._scienceRate}/s</span
                  >`
                : nothing}
            </div>
          </div>

          <!-- Active Operation / Placement Status Chips -->
          <div class="flex flex-wrap items-center gap-2">
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
                    <span>Placing: ${this._ghostStructure}</span>
                    <span class="opacity-80">✕</span>
                  </button>`
                : nothing
            }
          </div>
        </div>

        <!-- Bottom Strip: 4 Spacious Sovereign Menu Buttons (4-col bottom dock, 2x2 vertical side rail) -->
        <div class="${isSideRail ? "grid grid-cols-2 gap-2" : "grid grid-cols-4 gap-2"}">
          <button
            type="button"
            data-hud-menu="buildings"
            @click=${() => this.togglePanel("buildings")}
            class="justify-center ${menuTabClass(
              "buildings",
              this._ghostStructure !== null,
            )}"
          >
            <span>Buildings</span>
            ${showBuildingsDot ? renderRedDot() : nothing}
          </button>

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

          <button
            type="button"
            data-hud-menu="alliances"
            @click=${() => this.togglePanel("alliances")}
            class="justify-center ${menuTabClass("alliances")}"
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
          </button>
        </div>
      </div>
    `;
  }
}
