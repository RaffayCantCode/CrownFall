import { TileRef } from "@openfront/engine-api/game/GameMap";
import { GameMode, GameType, Gold } from "@openfront/engine-api/game/GameTypes";
import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import { ClientID } from "@openfront/engine-api/Schemas";
import { Config } from "@openfront/engine-lib/configuration/Config";
import { crisisTroopRegenPercent } from "@openfront/engine-lib/configuration/CrownfallCrises";
import { renderNumber, renderTroops } from "@openfront/engine-lib/Format";
import { assetUrl } from "@openfront/shared/AssetUrls";
import {
  EventBus,
  type EventConstructor,
  type GameEvent,
} from "@openfront/shared/EventBus";
import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { keyed } from "lit/directives/keyed.js";
import { Controller } from "../../Controller";
import { AttackRatioEvent, isForwardedClick } from "../../InputHandler";
import { UIState } from "../../UIState";
import {
  HUD_POSITION_KEY,
  type HudPosition,
  USER_SETTINGS_CHANGED_EVENT,
  UserSettings,
} from "../../UserSettings";
import { getGamesPlayed, translateText } from "../../Utils";
import { GameView } from "../../view";
import { PlayerView } from "../../view/PlayerView";
import { goldCoinIcon, soldierIcon } from "../HotbarIcons";
import { OnboardingLowTroopsEvent } from "../Onboarding";
import { TutorialHighlight, TutorialHighlightEvent } from "../Tutorial";
const swordIcon = assetUrl("images/SwordIcon.svg");

@customElement("control-panel")
export class ControlPanel extends LitElement implements Controller {
  public game: GameView;
  public clientID: ClientID;
  public eventBus: EventBus;
  public uiState: UIState;

  @state()
  private attackRatio: number = 0.2;

  @state()
  private _maxTroops: number;

  @state()
  private troopRate: number;

  @state()
  private _troops: number;

  @state()
  private _isVisible = false;

  @state()
  private _hudPosition: HudPosition = new UserSettings().hudPosition();

  @state()
  private _notification: { type: "warning" | "info"; message: string } | null =
    null;

  @state()
  private _gold: Gold;

  @state()
  private _attackingTroops: number = 0;

  @state()
  private _goldGain: bigint | null = null;
  @state()
  private _goldGainPulseId: number = 0;
  private _goldGainTimeoutId: ReturnType<typeof setTimeout> | null = null;

  @state()
  private _tutorialHighlight: TutorialHighlight | null = null;
  /** The onboarding tutorial's low-troops warning is up: flash the bar. */
  @state()
  private _lowTroopsAlert = false;

  private _troopRateIsIncreasing: boolean = true;

  private _lastTroopIncreaseRate: number;

  // Border detection cache
  private _nearbyPlayerIDs: Set<number> = new Set();
  private _borderRefreshCounter: number = 0;
  private _borderTilesPromise: Promise<void> | null = null;
  private _borderGeneration = 0;
  // Track last attack tick per target player (for 15-second threshold)
  private _lastAttackTickByTarget: Map<number, number> = new Map();
  private static readonly BORDER_REFRESH_INTERVAL = 10; // recompute every 1s
  private static readonly ATTACK_THRESHOLD_TICKS = 15 * 10; // 15 seconds

  private eventUnsubscribers: Array<() => void> = [];
  private initGeneration = 0;

  private onBus<T extends GameEvent>(
    eventType: EventConstructor<T>,
    handler: (event: T) => void,
  ): void {
    const bus = this.eventBus;
    if (!bus) return;
    bus.on(eventType, handler);
    this.eventUnsubscribers.push(() => bus.off?.(eventType, handler));
  }

  private unsubscribeBus(): void {
    for (const unsub of this.eventUnsubscribers) {
      unsub();
    }
    this.eventUnsubscribers = [];
  }

  connectedCallback() {
    super.connectedCallback();
    // The attack ratio is cached below for the lifetime of the game, but the
    // settings modal is now reachable mid-match, so follow the stored value
    // when it changes there. (This panel's own slider is session-only: it
    // never writes UserSettings, so there is no loop.)
    globalThis.addEventListener(
      `${USER_SETTINGS_CHANGED_EVENT}:settings.attackRatio`,
      this.onAttackRatioSettingChanged,
    );
    globalThis.addEventListener(
      `${USER_SETTINGS_CHANGED_EVENT}:${HUD_POSITION_KEY}`,
      this.onHudPositionChanged,
    );
  }

  init(): () => void {
    this.unsubscribeBus();
    const gen = ++this.initGeneration;
    this.attackRatio = new UserSettings().attackRatio();
    this.uiState.attackRatio = this.attackRatio;
    this.onBus(TutorialHighlightEvent, (e) => {
      this._tutorialHighlight = e.target;
    });
    this.onBus(OnboardingLowTroopsEvent, (e) => {
      this._lowTroopsAlert = e.low;
    });
    this.onBus(AttackRatioEvent, (event) => {
      let newAttackRatio = this.attackRatio + event.attackRatio / 100;

      if (newAttackRatio < 0.01) {
        newAttackRatio = 0.01;
      }

      if (newAttackRatio > 1) {
        newAttackRatio = 1;
      }

      if (newAttackRatio === 0.11 && this.attackRatio === 0.01) {
        // If we're changing the ratio from 1%, then set it to 10% instead of 11% to keep a consistency
        newAttackRatio = 0.1;
      }

      this.attackRatio = newAttackRatio;
      this.onAttackRatioChange(this.attackRatio);
    });
    return () => {
      if (gen === this.initGeneration) {
        this.dispose();
      }
    };
  }

  tick() {
    if (!this._isVisible && !this.game.inSpawnPhase()) {
      this.setVisibile(true);
    }

    const player = this.game.myPlayer();
    if (player === null || !player.isAlive()) {
      this.setVisibile(false);
      return;
    }

    this.updateTroopIncrease();

    const config = this.game.config();
    this._maxTroops = config.maxTroops(player);
    this._gold = player.gold();
    this._troops = player.troops();
    this._attackingTroops = player
      .outgoingAttacks()
      .map((a) => a.troops)
      .reduce((a, b) => a + b, 0);
    const baseRate = config.troopIncreaseRate(player) * 10;
    const pathMods = player.pathModifiers();
    const crisisRegen = crisisTroopRegenPercent(player.stability());
    const combinedRegenPercent = (pathMods.troopRegenPercent * crisisRegen) / 100;
    this.troopRate = (baseRate * combinedRegenPercent) / 100;

    const helpEnabled = new UserSettings().helpMessages();

    // Don't target veteran players
    if (helpEnabled && getGamesPlayed() < 20) {
      // Track outgoing attacks for 15-second threshold
      this.trackOutgoingAttacks(player);

      // Refresh border detection cache periodically
      this.refreshNearbyPlayers(player);

      // Compute notification
      this._notification = this.computeNotification(player, config);
    }

    const updates = this.game.updatesSinceLastTick();
    if (updates) {
      const myID = player.id();
      const bonusEvents = updates[GameUpdateType.BonusEvent];
      if (bonusEvents) {
        for (const ev of bonusEvents) {
          if (ev.player === myID && ev.gold > 0) {
            this.addGoldGain(BigInt(ev.gold));
          }
        }
      }
      const conquestEvents = updates[GameUpdateType.ConquestEvent];
      if (conquestEvents) {
        for (const ev of conquestEvents) {
          if (ev.conquerorId === myID && ev.gold > 0n) {
            this.addGoldGain(ev.gold);
          }
        }
      }
      const donateEvents = updates[GameUpdateType.DonateEvent];
      if (donateEvents) {
        for (const ev of donateEvents) {
          if (
            ev.donationType === "gold" &&
            ev.recipientId === myID &&
            ev.amount > 0n
          ) {
            this.addGoldGain(ev.amount);
          }
        }
      }
    }

    this.requestUpdate();
  }

  // Last-wins: when multiple gold events arrive in one tick, the pip shows
  // only the most recent amount (not a sum) — each gain restarts the pulse.
  private addGoldGain(amount: bigint) {
    this._goldGain = amount;
    this._goldGainPulseId++;
    if (this._goldGainTimeoutId !== null) {
      clearTimeout(this._goldGainTimeoutId);
    }
    this._goldGainTimeoutId = setTimeout(() => {
      this._goldGain = null;
      this._goldGainTimeoutId = null;
      this.requestUpdate();
    }, 2000);
  }

  private trackOutgoingAttacks(player: PlayerView) {
    const currentTick = this.game.ticks();
    for (const attack of player.outgoingAttacks()) {
      if (attack.targetID !== 0 && !attack.retreating) {
        this._lastAttackTickByTarget.set(attack.targetID, currentTick);
      }
    }
    // Clean up old entries
    for (const [playerID, tick] of this._lastAttackTickByTarget.entries()) {
      if (currentTick - tick > ControlPanel.ATTACK_THRESHOLD_TICKS * 2) {
        this._lastAttackTickByTarget.delete(playerID);
      }
    }
  }

  private refreshNearbyPlayers(player: PlayerView) {
    this._borderRefreshCounter++;
    if (
      this._borderRefreshCounter < ControlPanel.BORDER_REFRESH_INTERVAL ||
      this._borderTilesPromise !== null
    ) {
      return;
    }
    this._borderRefreshCounter = 0;
    const gen = this._borderGeneration;
    this._borderTilesPromise = player
      .borderTiles()
      .then((bt) => {
        if (gen !== this._borderGeneration) return;
        this._borderTilesPromise = null;
        const myID = player.smallID();
        const nearby = new Set<number>();
        for (const tile of bt.borderTiles) {
          for (const neighbor of this.game.neighbors(tile as TileRef)) {
            const ownerID = this.game.ownerID(neighbor);
            if (ownerID !== 0 && ownerID !== myID) {
              nearby.add(ownerID);
            }
          }
        }
        this._nearbyPlayerIDs = nearby;
      })
      .catch(() => {
        if (gen === this._borderGeneration) {
          this._borderTilesPromise = null;
        }
      });
  }

  private computeNotification(
    player: PlayerView,
    config: Config,
  ): { type: "warning" | "info"; message: string } | null {
    const currentTick = this.game.ticks();

    // Army limit warning
    const { gameMode, gameType } = config.gameConfig();
    const isPublicTeamGame =
      gameMode === GameMode.Team && gameType === GameType.Public;
    const canDonateTroops = config.donateTroops();
    if (isPublicTeamGame && canDonateTroops) {
      const ratio = this._troops / Math.max(this._maxTroops, 1);
      if (ratio >= config.armyLimitWarningThreshold()) {
        return {
          type: "warning",
          message: "control_panel.army_limit_warning",
        };
      }
    }

    // Low troops (Less than 1k) warning
    if (this._troops < 10000 && this._troops > 0) {
      return { type: "warning", message: "control_panel.low_troops_warning" };
    }

    // Info messages: check nearby players for traitors, AFK allies, AFK teammates
    for (const nearbyID of this._nearbyPlayerIDs) {
      let other;
      try {
        other = this.game.playerBySmallID(nearbyID);
      } catch {
        continue;
      }
      if (!other.isPlayer() || !other.isAlive()) continue;

      const lastAttackTick = this._lastAttackTickByTarget.get(nearbyID) ?? -1;
      const secondsSinceAttack = (currentTick - lastAttackTick) / 10;
      const hasNotAttackedRecently =
        lastAttackTick < 0 || secondsSinceAttack > 15;

      if (!hasNotAttackedRecently) continue;

      if (other.isTraitor() && player.isAlliedWith(other)) {
        return { type: "info", message: "control_panel.traitor_neighbor_info" };
      }
      if (other.isDisconnected() && player.isAlliedWith(other)) {
        return {
          type: "info",
          message: "control_panel.allied_afk_neighbor_info",
        };
      }
      if (other.isDisconnected() && player.isOnSameTeam(other)) {
        return {
          type: "info",
          message: "control_panel.teammate_afk_neighbor_info",
        };
      }
    }

    return null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    globalThis.removeEventListener(
      `${USER_SETTINGS_CHANGED_EVENT}:settings.attackRatio`,
      this.onAttackRatioSettingChanged,
    );
    globalThis.removeEventListener(
      `${USER_SETTINGS_CHANGED_EVENT}:${HUD_POSITION_KEY}`,
      this.onHudPositionChanged,
    );
    if (this._goldGainTimeoutId !== null) {
      clearTimeout(this._goldGainTimeoutId);
      this._goldGainTimeoutId = null;
    }
  }

  private updateTroopIncrease() {
    const player = this.game?.myPlayer();
    if (player === null) return;
    const troopIncreaseRate = this.game.config().troopIncreaseRate(player);
    this._troopRateIsIncreasing =
      troopIncreaseRate >= this._lastTroopIncreaseRate;
    this._lastTroopIncreaseRate = troopIncreaseRate;
  }

  onAttackRatioChange(newRatio: number) {
    // The element outlives any one game; uiState only exists once init() ran.
    // Before that (the hidden slider on the lobby page) this.attackRatio holds
    // the value, and init() reloads it from UserSettings anyway.
    if (this.uiState === undefined) return;
    this.uiState.attackRatio = newRatio;
  }

  private onAttackRatioSettingChanged = () => {
    if (this.uiState === undefined) return;
    this.attackRatio = new UserSettings().attackRatio();
    this.onAttackRatioChange(this.attackRatio);
    this.requestUpdate();
  };

  private onHudPositionChanged = () => {
    this._hudPosition = new UserSettings().hudPosition();
    this.requestUpdate();
  };

  setVisibile(visible: boolean) {
    this._isVisible = visible;
    this.requestUpdate();
  }

  setVisible(visible: boolean) {
    this.setVisibile(visible);
  }

  dispose(): void {
    this.initGeneration++;
    this.unsubscribeBus();
    if (this._goldGainTimeoutId !== null) {
      clearTimeout(this._goldGainTimeoutId);
      this._goldGainTimeoutId = null;
    }
    this._nearbyPlayerIDs.clear();
    this._lastAttackTickByTarget.clear();
    this._notification = null;
    this._goldGain = null;
    this._tutorialHighlight = null;
    this._lowTroopsAlert = false;
    this._borderRefreshCounter = 0;
    this._borderGeneration++;
    this._borderTilesPromise = null;
    this.setVisible(false);
  }

  private handleRatioSliderInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const value = Number(input.value);
    this.attackRatio = value / 100;
    this.onAttackRatioChange(this.attackRatio);
  }

  private handleRatioSliderPointerUp(e: Event) {
    (e.target as HTMLInputElement).blur();
  }

  /**
   * The browser only moves a range input on a real pointer press. A tap that
   * the radial menu forwarded down from its overlay never reaches the slider
   * as a press, so move it from the tap position here.
   */
  private handleRatioSliderClick(e: MouseEvent) {
    if (!isForwardedClick(e)) return;
    const input = e.currentTarget as HTMLInputElement | null;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    if (rect.width === 0) return;
    const min = Number(input.min);
    const max = Number(input.max);
    const position = Math.min(
      Math.max((e.clientX - rect.left) / rect.width, 0),
      1,
    );
    const value = Math.round(min + position * (max - min));
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  private calculateTroopBar(): { greenPercent: number; orangePercent: number } {
    const base = Math.max(this._maxTroops, 1);
    const greenPercentRaw = (this._troops / base) * 100;
    const orangePercentRaw = (this._attackingTroops / base) * 100;

    const greenPercent = Math.max(0, Math.min(100, greenPercentRaw));
    const orangePercent = Math.max(
      0,
      Math.min(100 - greenPercent, orangePercentRaw),
    );

    return { greenPercent, orangePercent };
  }

  private renderMobileTroopBar() {
    const { greenPercent, orangePercent } = this.calculateTroopBar();
    return html`
      <div
        class="w-full h-6 border ${
          this._lowTroopsAlert ? "border-red-500" : "border-gray-600"
        } rounded-md bg-gray-900/60 overflow-hidden relative"
      >
        <div class="relative h-full">
          <div
            class="absolute inset-y-0 left-0 w-full origin-left bg-malibu-blue transition-transform duration-200 ease-out"
            style="transform: scaleX(${greenPercent / 100});"
          ></div>
          <div
            class="absolute inset-y-0 left-0 w-full origin-left bg-aquarius transition-transform duration-200 ease-out"
            style="transform: translateX(${greenPercent}%) scaleX(${
              orangePercent / 100
            });"
          ></div>
        </div>
        ${
          this._lowTroopsAlert
            ? html`<div
                class="troop-bar-alert absolute inset-0 bg-red-600"
              ></div>`
            : nothing
        }
        <div
          class="absolute inset-0 flex items-center justify-between px-1.5 text-xs font-bold leading-none pointer-events-none"
          translate="no"
        >
          <span class="text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
            >${renderTroops(this._troops)}</span
          >
          <span class="text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
            >${renderTroops(this._maxTroops)}</span
          >
        </div>
        <div
          class="absolute inset-0 flex items-center justify-center pointer-events-none"
          translate="no"
        >
          <div
            class="flex items-center gap-0.5 px-1 ${this.tutorialHighlightClass(
              "troop_rate",
            )}"
          >
            <img
              src=${soldierIcon}
              alt=""
              aria-hidden="true"
              width="12"
              height="12"
              class="brightness-0 invert drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
            />
            <span
              class="text-[10px] font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] ${
                this._troopRateIsIncreasing
                  ? "text-green-400"
                  : "text-orange-400"
              }"
              >+${renderTroops(this.troopRate)}/s</span
            >
          </div>
        </div>
      </div>
    `;
  }

  private renderDesktopTroopBar() {
    const { greenPercent, orangePercent } = this.calculateTroopBar();
    return html`
      <div
        class="w-full h-6 border ${
          this._lowTroopsAlert ? "border-red-500" : "border-gray-600"
        } rounded-md bg-gray-900/60 overflow-hidden relative"
      >
        <div class="relative h-full">
          <div
            class="absolute inset-y-0 left-0 w-full origin-left bg-malibu-blue transition-transform duration-200 ease-out"
            style="transform: scaleX(${greenPercent / 100});"
          ></div>
          <div
            class="absolute inset-y-0 left-0 w-full origin-left bg-aquarius transition-transform duration-200 ease-out"
            style="transform: translateX(${greenPercent}%) scaleX(${
              orangePercent / 100
            });"
          ></div>
        </div>
        ${
          this._lowTroopsAlert
            ? html`<div
                class="troop-bar-alert absolute inset-0 bg-red-600"
              ></div>`
            : nothing
        }
        <div
          class="absolute inset-0 flex items-center text-lg font-bold leading-none pointer-events-none"
          translate="no"
        >
          <span class="flex-1 flex justify-end h-full items-center pr-0.5">
            <span class="text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
              >${renderTroops(this._troops)}</span
            >
          </span>
          <span
            class="h-full flex items-center px-0.5 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
            >/</span
          >
          <span
            class="flex-1 flex justify-start h-full items-center pl-0.5 gap-0.5"
          >
            <span
              class="text-white tabular-nums w-[3.5rem] drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
              >${renderTroops(this._maxTroops)}</span
            >
            <img
              src=${soldierIcon}
              alt=""
              aria-hidden="true"
              width="22"
              height="22"
              class="shrink-0 brightness-0 invert drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] ml-1.5"
            />
          </span>
        </div>
      </div>
    `;
  }

  private tutorialHighlightClass(target: TutorialHighlight): string {
    return this._tutorialHighlight === target ? "tutorial-highlight" : "";
  }

  private renderNotification() {
    if (!this._notification) return html``;
    const isWarning = this._notification.type === "warning";
    return html`
      <div
        class="flex items-center gap-1.5 px-1.5 py-1 rounded-md border text-xs font-medium mb-1 ${
          isWarning
            ? "border-orange-400/60 bg-orange-400/10 text-orange-300"
            : "border-blue-400/60 bg-blue-400/10 text-blue-300"
        }"
      >
        <span class="shrink-0">${isWarning ? "⚠" : "ℹ"}</span>
        <span>${translateText(this._notification.message)}</span>
      </div>
    `;
  }

  private renderDesktop() {
    const isSideRail =
      this._hudPosition === "left" || this._hudPosition === "right";

    if (isSideRail) {
      return html`
        ${this.renderNotification()}
        <!-- Bespoke Vertical Side-Rail Empire Vitals + Attack Control -->
        <div class="flex flex-col gap-2 px-2.5 pt-2.5 pb-1.5 w-full min-w-0">
          <!-- Row 1: Full-width Troop Bar -->
          <div class="w-full min-w-0 ${this.tutorialHighlightClass("troops")}">
            ${this.renderDesktopTroopBar()}
          </div>

          <!-- Row 2: Regen Rate & Gold side-by-side -->
          <div class="grid grid-cols-2 gap-2 w-full min-w-0">
            <div
              class="flex items-center justify-center gap-1.5 border rounded-lg bg-[#0e131d] font-bold text-sm py-1 px-2 ${this.tutorialHighlightClass(
                "troop_rate",
              )} ${
                this._troopRateIsIncreasing
                  ? "border-emerald-400/45"
                  : "border-amber-400/50"
              }"
              translate="no"
            >
              <img
                src=${soldierIcon}
                alt=""
                aria-hidden="true"
                width="14"
                height="14"
                class="shrink-0"
                style="filter: ${
                  this._troopRateIsIncreasing
                    ? "brightness(0) saturate(100%) invert(74%) sepia(44%) saturate(500%) hue-rotate(83deg) brightness(103%)"
                    : "brightness(0) saturate(100%) invert(65%) sepia(60%) saturate(600%) hue-rotate(330deg) brightness(105%)"
                }"
              />
              <span
                class="text-sm font-bold tabular-nums ${
                  this._troopRateIsIncreasing
                    ? "text-emerald-400"
                    : "text-amber-300"
                }"
                >+${renderTroops(this.troopRate)}/s</span
              >
            </div>

            <div
              class="flex items-center justify-center gap-1.5 border rounded-lg bg-[#0e131d] border-[#d4af37]/55 font-bold text-[#f3d27a] text-sm py-1 px-2 relative ${this.tutorialHighlightClass(
                "gold",
              )}"
              translate="no"
            >
              ${
                this._goldGain !== null
                  ? keyed(
                      this._goldGainPulseId,
                      html`<span
                        class="gold-gain-pop absolute -top-5 right-[5px] text-emerald-400 text-xs font-extrabold tabular-nums whitespace-nowrap pointer-events-none drop-shadow-[0_2px_3px_rgba(0,0,0,0.9)]"
                        >+${renderNumber(this._goldGain)}</span
                      >`,
                    )
                  : ""
              }
              <img src=${goldCoinIcon} width="14" height="14" class="shrink-0" />
              <span class="tabular-nums">${renderNumber(this._gold)}</span>
            </div>
          </div>

          <!-- Row 3: Attack Ratio Stacked Header + Bounded Slider -->
          <div
            class="flex flex-col gap-1.5 w-full min-w-0 border border-white/10 rounded-lg bg-[#0e131d] px-2.5 py-1.5 ${this.tutorialHighlightClass(
              "attack_ratio",
            )}"
            translate="no"
          >
            <div class="flex items-center justify-between text-xs font-bold text-[#f4f1ea]">
              <div class="flex items-center gap-1.5">
                <img
                  src=${swordIcon}
                  alt=""
                  aria-hidden="true"
                  width="12"
                  height="12"
                  style="filter: brightness(0) invert(1);"
                />
                <span class="uppercase tracking-wider text-slate-400 text-[10px]">
                  Attack Ratio
                </span>
              </div>
              <span class="tabular-nums text-sm"
                >${(this.attackRatio * 100).toFixed(0)}%
                <span class="text-[#9aa3b2] font-medium"
                  >(${renderTroops(
                    (this.game?.myPlayer()?.troops() ?? 0) * this.attackRatio,
                  )})</span
                ></span
              >
            </div>
            <input
              type="range"
              min="1"
              max="100"
              .value=${String(Math.round(this.attackRatio * 100))}
              @input=${(e: Event) => this.handleRatioSliderInput(e)}
              @pointerup=${(e: Event) => this.handleRatioSliderPointerUp(e)}
              @click=${(e: MouseEvent) => this.handleRatioSliderClick(e)}
              data-radial-click-through
              class="w-full min-w-0 h-2 accent-[#d4af37] cursor-pointer"
            />
          </div>
        </div>
      `;
    }

    return html`
      ${this.renderNotification()}
      <!-- Clean, spacious 2-row bounded Empire Vitals + Attack Control (never overflows) -->
      <div class="flex flex-col gap-2 px-2 pt-1.5 pb-1 w-full min-w-0">
        <!-- Row 1: Troop Rate | Troop Progress Bar | Gold -->
        <div class="flex items-center gap-2 w-full min-w-0">
          <!-- Troop rate -->
          <div
            class="flex items-center gap-1.5 shrink-0 border rounded-lg bg-[#0e131d] font-bold text-sm py-1 px-2.5 min-w-[5.75rem] ${this.tutorialHighlightClass(
              "troop_rate",
            )} ${
              this._troopRateIsIncreasing
                ? "border-emerald-400/45"
                : "border-amber-400/50"
            }"
            translate="no"
          >
            <img
              src=${soldierIcon}
              alt=""
              aria-hidden="true"
              width="14"
              height="14"
              class="shrink-0"
              style="filter: ${
                this._troopRateIsIncreasing
                  ? "brightness(0) saturate(100%) invert(74%) sepia(44%) saturate(500%) hue-rotate(83deg) brightness(103%)"
                  : "brightness(0) saturate(100%) invert(65%) sepia(60%) saturate(600%) hue-rotate(330deg) brightness(105%)"
              }"
            />
            <span
              class="text-sm font-bold tabular-nums ${
                this._troopRateIsIncreasing
                  ? "text-emerald-400"
                  : "text-amber-300"
              }"
              >+${renderTroops(this.troopRate)}/s</span
            >
          </div>

          <!-- Troop bar -->
          <div class="flex-1 min-w-0 ${this.tutorialHighlightClass("troops")}">
            ${this.renderDesktopTroopBar()}
          </div>

          <!-- Gold -->
          <div
            class="flex items-center gap-1.5 shrink-0 border rounded-lg bg-[#0e131d] border-[#d4af37]/55 font-bold text-[#f3d27a] text-sm py-1 px-3 min-w-[5.25rem] relative ${this.tutorialHighlightClass(
              "gold",
            )}"
            translate="no"
          >
            ${
              this._goldGain !== null
                ? keyed(
                    this._goldGainPulseId,
                    html`<span
                      class="gold-gain-pop absolute -top-5 right-[5px] text-emerald-400 text-xs font-extrabold tabular-nums whitespace-nowrap pointer-events-none drop-shadow-[0_2px_3px_rgba(0,0,0,0.9)]"
                      >+${renderNumber(this._goldGain)}</span
                    >`,
                  )
                : ""
            }
            <img src=${goldCoinIcon} width="14" height="14" class="shrink-0" />
            <span class="tabular-nums">${renderNumber(this._gold)}</span>
          </div>
        </div>

        <!-- Row 2: Attack Ratio Readout + Full-Width Bounded Slider -->
        <div
          class="flex items-center gap-3 w-full min-w-0 border border-white/10 rounded-lg bg-[#0e131d] px-3 py-1.5 ${this.tutorialHighlightClass(
            "attack_ratio",
          )}"
          translate="no"
        >
          <div
            class="flex items-center gap-1.5 shrink-0 text-sm font-bold text-[#f4f1ea] min-w-[8.25rem]"
          >
            <img
              src=${swordIcon}
              alt=""
              aria-hidden="true"
              width="13"
              height="13"
              style="filter: brightness(0) invert(1);"
            />
            <span class="tabular-nums"
              >${(this.attackRatio * 100).toFixed(0)}%
              <span class="text-[#9aa3b2] font-medium"
                >(${renderTroops(
                  (this.game?.myPlayer()?.troops() ?? 0) * this.attackRatio,
                )})</span
              ></span
            >
          </div>
          <input
            type="range"
            min="1"
            max="100"
            .value=${String(Math.round(this.attackRatio * 100))}
            @input=${(e: Event) => this.handleRatioSliderInput(e)}
            @pointerup=${(e: Event) => this.handleRatioSliderPointerUp(e)}
            @click=${(e: MouseEvent) => this.handleRatioSliderClick(e)}
            data-radial-click-through
            class="flex-1 min-w-0 w-full h-2 accent-[#d4af37] cursor-pointer"
          />
        </div>
      </div>
    `;
  }

  private getMobileAttackRatioLabel(): string {
    const percent = (this.attackRatio * 100).toFixed(0);
    const troops = renderTroops(
      (this.game?.myPlayer()?.troops() ?? 0) * this.attackRatio,
    );
    const translated = translateText("control_panel.attack_ratio", {
      percent,
      troops,
    });
    return translated !== "control_panel.attack_ratio" &&
      translated.includes(percent)
      ? translated
      : `${percent}%\n(${troops})`;
  }

  private renderMobile() {
    return html`
      ${this.renderNotification()}
      <div class="flex gap-2 items-center">
        <!-- Gold -->
        <div
          class="flex items-center justify-center p-1 gap-0.5 border rounded-md border-yellow-400 font-bold text-yellow-400 text-xs w-1/5 shrink-0 relative ${this.tutorialHighlightClass(
            "gold",
          )}"
          translate="no"
        >
          ${
            this._goldGain !== null
              ? keyed(
                  this._goldGainPulseId,
                  html`<span
                    class="gold-gain-pop absolute -top-5 right-[5px] min-[1015px]:right-[9px] text-green-400 text-xs font-extrabold tabular-nums whitespace-nowrap pointer-events-none drop-shadow-[0_2px_3px_rgba(0,0,0,0.9)]"
                    >+${renderNumber(this._goldGain)}</span
                  >`,
                )
              : ""
          }
          <img src=${goldCoinIcon} width="13" height="13" />
          <span class="px-0.5">${renderNumber(this._gold)}</span>
        </div>
        <!-- Troop bar -->
        <div
          class="w-[40%] shrink-0 flex items-center ${this.tutorialHighlightClass(
            "troops",
          )}"
        >
          ${this.renderMobileTroopBar()}
        </div>
        <!-- Sword + % and troop count label -->
        <div class="flex flex-col items-center justify-center shrink-0">
          <div class="flex items-center gap-0.5">
            <img
              src=${swordIcon}
              alt=""
              aria-hidden="true"
              width="10"
              height="10"
              style="filter: brightness(0) invert(1);"
            />
            <span
              class="text-white text-[11px] font-bold tabular-nums text-center leading-tight whitespace-pre-wrap"
              >${this.getMobileAttackRatioLabel()}</span
            >
          </div>
        </div>
        <!-- Attack ratio slider -->
        <div
          class="flex-1 min-w-0 ${this.tutorialHighlightClass("attack_ratio")}"
          translate="no"
        >
          <input
            type="range"
            min="1"
            max="100"
            .value=${String(Math.round(this.attackRatio * 100))}
            @input=${(e: Event) => this.handleRatioSliderInput(e)}
            @pointerup=${(e: Event) => this.handleRatioSliderPointerUp(e)}
            @click=${(e: MouseEvent) => this.handleRatioSliderClick(e)}
            data-radial-click-through
            class="w-full h-1.5 accent-aquarius cursor-pointer"
          />
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <style>
        @keyframes gold-gain-pop {
          0% {
            transform: translateY(4px);
            opacity: 0;
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .gold-gain-pop {
          animation: gold-gain-pop 0.25s ease-out;
        }
      </style>
      <div
        class="relative pointer-events-auto ${
          this._isVisible ? "relative w-full text-sm px-2 py-1" : "hidden"
        }"
        @contextmenu=${(e: MouseEvent) => e.preventDefault()}
      >
        <div class="lg:hidden">${this.renderMobile()}</div>
        <div class="hidden lg:block">${this.renderDesktop()}</div>
      </div>
    `;
  }

  createRenderRoot() {
    return this; // Disable shadow DOM to allow Tailwind styles
  }
}
