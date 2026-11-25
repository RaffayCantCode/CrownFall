import { AugmentId, DevelopmentPath } from "@openfront/engine-api/game/GameTypes";
import {
  AugmentDraftUpdate,
  GameUpdateType,
} from "@openfront/engine-api/game/GameUpdates";
import {
  getAugmentDefinition,
  MAX_AUGMENTS_PER_PLAYER,
} from "@openfront/engine-lib/configuration/CrownfallAugments";
import { assetUrl } from "@openfront/shared/AssetUrls";
import { EventBus } from "@openfront/shared/EventBus";
import { css, html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { Controller } from "../../Controller";
import {
  SendSelectAugmentIntentEvent,
  SendSelectDevPathIntentEvent,
} from "../../Transport";
import { translateText } from "../../Utils";
import { GameView } from "../../view";
import { renderAugmentEmblem, renderPathEmblem } from "./CrownfallEmblems";

const crownIcon = assetUrl("images/CrownfallCrownIcon.svg");

const OPENING_PATHS: readonly {
  path: DevelopmentPath;
  tagKey: string;
  proKey: string;
  conKey: string;
}[] = [
  {
    path: DevelopmentPath.Military,
    tagKey: "crownfall.path_draft.military.tag",
    proKey: "crownfall.path_draft.military.pro",
    conKey: "crownfall.path_draft.military.con",
  },
  {
    path: DevelopmentPath.Political,
    tagKey: "crownfall.path_draft.political.tag",
    proKey: "crownfall.path_draft.political.pro",
    conKey: "crownfall.path_draft.political.con",
  },
  {
    path: DevelopmentPath.Scientific,
    tagKey: "crownfall.path_draft.scientific.tag",
    proKey: "crownfall.path_draft.scientific.pro",
    conKey: "crownfall.path_draft.scientific.con",
  },
];

@customElement("augment-modal")
export class AugmentModal extends LitElement implements Controller {
  public game: GameView;
  public eventBus: EventBus;

  @state() private _draftKind: "path" | "augment" = "augment";
  @state() private _draftActive = false;
  @state() private _round = 1;
  @state() private _totalRounds = MAX_AUGMENTS_PER_PLAYER;
  @state() private _pickedCount = 0;
  @state() private _totalCount = 1;
  @state() private _ticksRemaining = -1;
  @state() private _choices: readonly AugmentId[] = [];
  @state() private _myPathChosen = false;
  @state() private _selectingKey: string | null = null;
  private _selectionTimer: ReturnType<typeof setTimeout> | null = null;

  static styles = css`
    :host {
      display: block;
    }

    @keyframes cfBackdropIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    @keyframes cfCardReveal {
      from {
        opacity: 0;
        transform: translateY(36px) scale(0.9);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes cfCardConfirm {
      0% {
        transform: translateY(-10px) scale(1.04);
        filter: brightness(1.1);
      }
      45% {
        transform: translateY(-16px) scale(1.09);
        filter: brightness(1.4);
      }
      100% {
        transform: translateY(-8px) scale(1.05);
        filter: brightness(1.15);
      }
    }

    @keyframes cfSheenSweep {
      0% {
        transform: translateX(-160%) skewX(-24deg);
      }
      100% {
        transform: translateX(240%) skewX(-24deg);
      }
    }

    .cf-overlay {
      position: fixed;
      inset: 0;
      z-index: 1600;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      background: radial-gradient(
        ellipse at center,
        rgba(8, 16, 22, 0.72) 0%,
        rgba(3, 6, 10, 0.88) 100%
      );
      backdrop-filter: blur(7px);
      animation: cfBackdropIn 220ms ease-out forwards;
      color: #f8f4e6;
      user-select: none;
    }

    .cf-header {
      text-align: center;
      margin-bottom: 1.75rem;
    }

    .cf-eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.25rem 0.9rem;
      border-radius: 9999px;
      border: 1px solid rgba(231, 196, 111, 0.45);
      background: rgba(12, 22, 28, 0.8);
      color: #f3dca2;
      font-size: 0.7rem;
      font-weight: 800;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      margin-bottom: 0.55rem;
    }

    .cf-title {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(1.6rem, 3vw, 2.4rem);
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      background: linear-gradient(180deg, #fff8dc 0%, #e5be64 55%, #9a7022 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      filter: drop-shadow(0 3px 14px rgba(229, 190, 100, 0.4));
    }

    .cf-subtitle {
      margin-top: 0.4rem;
      font-size: 0.84rem;
      color: #cbd5e1;
      letter-spacing: 0.04em;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
    }

    .cf-timer {
      display: inline-block;
      padding: 0.14rem 0.6rem;
      border-radius: 0.35rem;
      background: rgba(185, 28, 28, 0.28);
      border: 1px solid rgba(248, 113, 113, 0.6);
      color: #fecaca;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }

    .cf-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 1.75rem;
      width: 100%;
      max-width: 56rem;
      perspective: 1200px;
    }

    @media (max-width: 840px) {
      .cf-grid {
        grid-template-columns: 1fr;
        max-width: 22rem;
        gap: 1rem;
      }
    }

    /* Outer ornate metallic League-Arena-style tarot frame */
    .cf-card-frame {
      position: relative;
      padding: 6px;
      border-radius: 14px;
      background: linear-gradient(
        155deg,
        #f5e4b8 0%,
        #b89246 28%,
        #6d5529 55%,
        #c8a152 82%,
        #f7ebc8 100%
      );
      box-shadow:
        0 18px 42px rgba(0, 0, 0, 0.72),
        0 0 0 1px rgba(255, 244, 210, 0.35);
      cursor: pointer;
      border: none;
      text-align: center;
      transition:
        transform 260ms cubic-bezier(0.22, 1, 0.36, 1),
        box-shadow 260ms ease,
        opacity 260ms ease,
        filter 260ms ease;
      animation: cfCardReveal 380ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
    }

    .cf-card-frame:nth-child(2) {
      animation-delay: 80ms;
    }

    .cf-card-frame:nth-child(3) {
      animation-delay: 160ms;
    }

    .cf-card-frame:hover:not(.cf-dimmed):not(.cf-selected) {
      transform: translateY(-12px) scale(1.045);
      background: linear-gradient(
        155deg,
        #fffbe6 0%,
        #f0cc75 30%,
        #b68932 55%,
        #f5d787 82%,
        #fffdf2 100%
      );
      box-shadow:
        0 26px 54px rgba(0, 0, 0, 0.8),
        0 0 38px rgba(247, 224, 158, 0.72),
        0 0 0 2px rgba(255, 250, 225, 0.85);
    }

    .cf-card-frame.cf-selected {
      background: linear-gradient(155deg, #fffdf0 0%, #f5d061 50%, #fff7d6 100%);
      box-shadow:
        0 0 55px rgba(253, 230, 138, 0.95),
        0 0 0 3px #fef9c3;
      animation: cfCardConfirm 420ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
      cursor: default;
    }

    .cf-card-frame.cf-dimmed {
      opacity: 0.2;
      filter: grayscale(0.65);
      transform: scale(0.91);
      pointer-events: none;
    }

    /* Inner chamfered obsidian-emerald tarot body */
    .cf-card-inner {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      min-height: 23.5rem;
      padding: 1.75rem 1.35rem 1.5rem;
      border-radius: 9px;
      background:
        radial-gradient(
          circle at 50% 24%,
          rgba(231, 196, 111, 0.16) 0%,
          rgba(10, 32, 36, 0.45) 42%,
          rgba(4, 11, 15, 0.98) 85%
        ),
        #050d12;
      box-shadow:
        inset 0 0 0 1.5px rgba(212, 175, 55, 0.45),
        inset 0 0 28px rgba(0, 0, 0, 0.85);
      overflow: hidden;
    }

    /* Chamfered gold filigree inner border corners */
    .cf-card-inner::before {
      content: "";
      position: absolute;
      inset: 7px;
      border: 1px solid rgba(231, 196, 111, 0.28);
      clip-path: polygon(
        12px 0,
        calc(100% - 12px) 0,
        100% 12px,
        100% calc(100% - 12px),
        calc(100% - 12px) 100%,
        12px 100%,
        0 calc(100% - 12px),
        0 12px
      );
      pointer-events: none;
    }

    /* Diagonal champagne sheen on hover */
    .cf-card-inner::after {
      content: "";
      position: absolute;
      inset: 0;
      width: 55%;
      background: linear-gradient(
        90deg,
        transparent 0%,
        rgba(255, 248, 220, 0.18) 50%,
        transparent 100%
      );
      transform: translateX(-180%) skewX(-24deg);
      pointer-events: none;
    }

    .cf-card-frame:hover:not(.cf-dimmed):not(.cf-selected) .cf-card-inner::after {
      animation: cfSheenSweep 720ms ease-out;
    }

    .cf-emblem-stage {
      position: relative;
      width: 6.2rem;
      height: 6.2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 0.25rem;
      margin-bottom: 1rem;
    }

    .cf-emblem-halo {
      position: absolute;
      inset: 0;
      border-radius: 9999px;
      background: radial-gradient(
        circle,
        rgba(231, 196, 111, 0.26) 0%,
        transparent 70%
      );
      transition: transform 260ms ease, opacity 260ms ease;
    }

    .cf-card-frame:hover .cf-emblem-halo {
      transform: scale(1.25);
      opacity: 1;
    }

    .cf-emblem-svg {
      position: relative;
      width: 5.4rem;
      height: 5.4rem;
      filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.75))
        drop-shadow(0 0 12px rgba(231, 196, 111, 0.25));
      transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1), filter 260ms ease;
    }

    .cf-card-frame:hover .cf-emblem-svg {
      transform: scale(1.09);
      filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.85))
        drop-shadow(0 0 20px rgba(253, 230, 138, 0.55));
    }

    .cf-card-name {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 1.25rem;
      font-weight: 700;
      color: #faf6eb;
      letter-spacing: 0.04em;
    }

    .cf-tag {
      display: inline-block;
      margin-top: 0.45rem;
      margin-bottom: 1rem;
      padding: 0.14rem 0.65rem;
      border-radius: 3px;
      border: 1px solid rgba(203, 178, 121, 0.45);
      background: rgba(18, 32, 38, 0.9);
      color: #d6c397;
      font-size: 0.66rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .cf-divider {
      width: 70%;
      height: 1px;
      background: linear-gradient(
        90deg,
        transparent,
        rgba(231, 196, 111, 0.55),
        transparent
      );
      margin-bottom: 0.95rem;
    }

    .cf-effects {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      font-size: 0.84rem;
      line-height: 1.4;
      padding: 0 0.25rem;
    }

    .cf-pro-text {
      color: #86efac;
      font-weight: 600;
    }

    .cf-con-text {
      color: #fca5a5;
      font-weight: 500;
      opacity: 0.92;
    }

    .cf-footer-hint {
      margin-top: 1.15rem;
      font-size: 0.68rem;
      font-weight: 800;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(231, 196, 111, 0.65);
      transition: color 220ms ease;
    }

    .cf-card-frame:hover .cf-footer-hint,
    .cf-card-frame.cf-selected .cf-footer-hint {
      color: #fef08a;
    }

    .cf-waiting-box {
      border-radius: 14px;
      padding: 5px;
      background: linear-gradient(155deg, #f3e1b4, #9c7a35, #f3e1b4);
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.78);
    }

    .cf-waiting-inner {
      border-radius: 10px;
      background: #061016;
      padding: 1.75rem 2.75rem;
      text-align: center;
    }
  `;

  init(): void {
    this._draftActive = false;
    this._choices = [];
    this._myPathChosen = false;
    this._selectingKey = null;
    if (this._selectionTimer !== null) {
      clearTimeout(this._selectionTimer);
      this._selectionTimer = null;
    }
  }

  tick(): void {
    if (!this.game || this.game.inSpawnPhase()) {
      this._draftActive = false;
      this._choices = [];
      return;
    }

    const updates = this.game.updatesSinceLastTick();
    const draftUpdates = updates?.[GameUpdateType.AugmentDraft] as
      | AugmentDraftUpdate[]
      | undefined;
    if (draftUpdates && draftUpdates.length > 0) {
      const latest = draftUpdates[draftUpdates.length - 1];
      this._draftKind = latest.draftKind;
      this._draftActive = latest.active;
      this._round = latest.round;
      this._totalRounds = latest.totalRounds;
      this._pickedCount = latest.pickedCount;
      this._totalCount = latest.totalCount;
      this._ticksRemaining = latest.ticksRemaining;
      if (!latest.active) {
        this._selectingKey = null;
      }
    }

    const myPlayer = this.game.myPlayer();
    const myPathChosen = myPlayer ? myPlayer.primaryPath() !== null : true;
    if (myPathChosen !== this._myPathChosen) {
      this._myPathChosen = myPathChosen;
    }

    const nextChoices =
      myPlayer && myPlayer.isAlive() ? myPlayer.pendingAugmentChoices() : [];
    if (
      nextChoices.length !== this._choices.length ||
      nextChoices.some((c, i) => c !== this._choices[i])
    ) {
      this._choices = nextChoices.slice();
      if (nextChoices.length === 0 && !this._draftActive) {
        this._selectingKey = null;
      }
    }
  }

  private onChoosePath(path: DevelopmentPath) {
    if (this._selectingKey !== null) return;
    this._selectingKey = path;
    if (this._selectionTimer !== null) {
      clearTimeout(this._selectionTimer);
    }
    this._selectionTimer = setTimeout(() => {
      this._selectionTimer = null;
      this.eventBus?.emit(new SendSelectDevPathIntentEvent(path));
    }, 380);
  }

  private onChooseAugment(id: AugmentId) {
    if (this._selectingKey !== null) return;
    this._selectingKey = id;
    if (this._selectionTimer !== null) {
      clearTimeout(this._selectionTimer);
    }
    this._selectionTimer = setTimeout(() => {
      this._selectionTimer = null;
      this.eventBus?.emit(new SendSelectAugmentIntentEvent(id));
    }, 380);
  }

  render() {
    const isPathDraft = this._draftActive && this._draftKind === "path";
    const isAugmentDraft =
      (this._draftActive && this._draftKind === "augment") ||
      this._choices.length > 0;

    if (!isPathDraft && !isAugmentDraft) {
      return nothing;
    }

    const secondsLeft =
      this._ticksRemaining >= 0 ? Math.ceil(this._ticksRemaining / 10) : null;

    // Waiting for other players in multiplayer
    const alreadyPicked = isPathDraft
      ? this._myPathChosen
      : this._choices.length === 0 && this._draftActive;

    if (alreadyPicked) {
      return html`
        <div class="cf-overlay" role="dialog" aria-modal="true">
          <div class="cf-waiting-box">
            <div class="cf-waiting-inner">
              <div class="cf-eyebrow">
                <img src=${crownIcon} alt="" style="width:14px;height:14px;" />
                ${isPathDraft
                  ? translateText("crownfall.path_draft_badge")
                  : translateText("crownfall.augment_round_badge", {
                      round: this._round,
                      total: this._totalRounds,
                    })}
              </div>
              <h2 class="cf-title" style="font-size:1.5rem;">
                ${translateText("crownfall.augment_waiting_title")}
              </h2>
              <div class="cf-subtitle">
                <span>
                  ${translateText("crownfall.augment_waiting_desc", {
                    picked: this._pickedCount,
                    total: this._totalCount,
                  })}
                </span>
                ${secondsLeft !== null
                  ? html`<span class="cf-timer">${secondsLeft}s</span>`
                  : nothing}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    if (isPathDraft) {
      return html`
        <div class="cf-overlay" role="dialog" aria-modal="true">
          <div class="cf-header">
            <div class="cf-eyebrow">
              <img src=${crownIcon} alt="" style="width:14px;height:14px;" />
              ${translateText("crownfall.path_draft_badge")}
            </div>
            <h2 class="cf-title">
              ${translateText("crownfall.path_draft_title")}
            </h2>
            <div class="cf-subtitle">
              <span>${translateText("crownfall.path_draft_subtitle")}</span>
              ${this._totalCount > 1
                ? html`<span>
                    (${this._pickedCount}/${this._totalCount}
                    ${translateText("crownfall.augment_ready")})
                  </span>`
                : nothing}
              ${secondsLeft !== null
                ? html`<span class="cf-timer">${secondsLeft}s</span>`
                : nothing}
            </div>
          </div>

          <div class="cf-grid">
            ${OPENING_PATHS.map(({ path, tagKey, proKey, conKey }) => {
              const isSelected = this._selectingKey === path;
              const isDimmed =
                this._selectingKey !== null && this._selectingKey !== path;

              return html`
                <button
                  type="button"
                  class="cf-card-frame ${isSelected
                    ? "cf-selected"
                    : ""} ${isDimmed ? "cf-dimmed" : ""}"
                  @click=${() => this.onChoosePath(path)}
                >
                  <div class="cf-card-inner">
                    <div class="cf-emblem-stage">
                      <div class="cf-emblem-halo"></div>
                      ${renderPathEmblem(path)}
                    </div>

                    <h3 class="cf-card-name">
                      ${translateText(`crownfall.path.${path}.name`)}
                    </h3>
                    <div class="cf-tag">${translateText(tagKey)}</div>
                    <div class="cf-divider"></div>

                    <div class="cf-effects">
                      <div class="cf-pro-text">${translateText(proKey)}</div>
                      <div class="cf-con-text">${translateText(conKey)}</div>
                    </div>

                    <div class="cf-footer-hint">
                      ${isSelected
                        ? translateText("crownfall.augment_selected")
                        : translateText("crownfall.path_draft_choose")}
                    </div>
                  </div>
                </button>
              `;
            })}
          </div>
        </div>
      `;
    }

    return html`
      <div class="cf-overlay" role="dialog" aria-modal="true">
        <div class="cf-header">
          <div class="cf-eyebrow">
            <img src=${crownIcon} alt="" style="width:14px;height:14px;" />
            ${translateText("crownfall.augment_round_badge", {
              round: this._round,
              total: this._totalRounds,
            })}
          </div>
          <h2 class="cf-title">${translateText("crownfall.augment_title")}</h2>
          <div class="cf-subtitle">
            <span>${translateText("crownfall.augment_subtitle")}</span>
            ${this._totalCount > 1
              ? html`<span>
                  (${this._pickedCount}/${this._totalCount}
                  ${translateText("crownfall.augment_ready")})
                </span>`
              : nothing}
            ${secondsLeft !== null
              ? html`<span class="cf-timer">${secondsLeft}s</span>`
              : nothing}
          </div>
        </div>

        <div class="cf-grid">
          ${this._choices.map((id) => {
            const def = getAugmentDefinition(id);
            const isSelected = this._selectingKey === id;
            const isDimmed =
              this._selectingKey !== null && this._selectingKey !== id;

            return html`
              <button
                type="button"
                class="cf-card-frame ${isSelected
                  ? "cf-selected"
                  : ""} ${isDimmed ? "cf-dimmed" : ""}"
                @click=${() => this.onChooseAugment(id)}
              >
                <div class="cf-card-inner">
                  <div class="cf-emblem-stage">
                    <div class="cf-emblem-halo"></div>
                    ${renderAugmentEmblem(id)}
                  </div>

                  <h3 class="cf-card-name">${translateText(def.nameKey)}</h3>
                  <div class="cf-tag">
                    ${translateText(`crownfall.augment_cat_${def.category}`)}
                  </div>
                  <div class="cf-divider"></div>

                  <div class="cf-effects">
                    <div class="cf-pro-text">${translateText(def.proKey)}</div>
                    <div class="cf-con-text">${translateText(def.conKey)}</div>
                  </div>

                  <div class="cf-footer-hint">
                    ${isSelected
                      ? translateText("crownfall.augment_selected")
                      : translateText("crownfall.augment_choose")}
                  </div>
                </div>
              </button>
            `;
          })}
        </div>
      </div>
    `;
  }
}
