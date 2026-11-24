import { TaxRate } from "@openfront/engine-api/game/GameTypes";
import {
  computeStabilityBreakdown,
  maxCivilianPopulation,
  sciencePerSecond,
  stabilityBand,
  type StabilityBreakdown,
} from "@openfront/engine-lib/configuration/CrownfallConfig";
import { renderNumber } from "@openfront/engine-lib/Format";
import { EventBus } from "@openfront/shared/EventBus";
import { html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { Controller } from "../../Controller";
import { SendSetTaxRateIntentEvent } from "../../Transport";
import { translateText } from "../../Utils";
import { GameView } from "../../view";

@customElement("national-dashboard")
export class NationalDashboard extends LitElement implements Controller {
  public game: GameView;
  public eventBus: EventBus;

  @state() private _visible = false;
  @state() private _civilians = 0;
  @state() private _civilianCap = 0;
  @state() private _science = 0;
  @state() private _scienceRate = 0;
  @state() private _stability = 75;
  @state() private _taxRate: TaxRate = TaxRate.Normal;
  @state() private _breakdown: StabilityBreakdown | null = null;
  @state() private _showDetails = false;

  createRenderRoot() {
    return this;
  }

  init(): void {
    this._visible = false;
    this._showDetails = false;
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
    const civ = myPlayer.civilianPopulation();
    const cap = maxCivilianPopulation(myPlayer);
    const sci = myPlayer.science();
    const stab = myPlayer.stability();
    const tax = myPlayer.taxRate();
    const sciRate = sciencePerSecond(myPlayer, civ, stab);
    const breakdown = computeStabilityBreakdown(
      myPlayer,
      tax,
      civ,
      myPlayer.incomingAttacks().length,
    );

    if (
      civ !== this._civilians ||
      cap !== this._civilianCap ||
      sci !== this._science ||
      sciRate !== this._scienceRate ||
      stab !== this._stability ||
      tax !== this._taxRate ||
      this._breakdown?.target !== breakdown.target
    ) {
      this._civilians = civ;
      this._civilianCap = cap;
      this._science = sci;
      this._scienceRate = sciRate;
      this._stability = stab;
      this._taxRate = tax;
      this._breakdown = breakdown;
    }
  }

  private setTaxRate(rate: TaxRate) {
    if (rate === this._taxRate) return;
    this.eventBus?.emit(new SendSetTaxRateIntentEvent(rate));
  }

  private toggleDetails() {
    this._showDetails = !this._showDetails;
  }

  render() {
    if (!this._visible) {
      return nothing;
    }

    const band = stabilityBand(this._stability);
    const bandColor =
      band === "stable"
        ? "text-emerald-400 border-emerald-500/40 bg-emerald-950/50"
        : band === "unrest"
          ? "text-amber-300 border-amber-500/40 bg-amber-950/50"
          : band === "crisis"
            ? "text-orange-400 border-orange-500/50 bg-orange-950/50"
            : "text-rose-400 border-rose-500/50 bg-rose-950/60";

    const target = this._breakdown?.target ?? this._stability;
    const trend =
      target > this._stability ? "↑" : target < this._stability ? "↓" : "•";
    const trendColor =
      target > this._stability
        ? "text-emerald-400"
        : target < this._stability
          ? "text-rose-400"
          : "text-slate-400";

    const taxButtons: Array<{ rate: TaxRate; labelKey: string }> = [
      { rate: TaxRate.Low, labelKey: "crownfall.tax_low" },
      { rate: TaxRate.Normal, labelKey: "crownfall.tax_normal" },
      { rate: TaxRate.High, labelKey: "crownfall.tax_high" },
    ];

    return html`
      <div
        class="relative border-b border-amber-400/25 bg-[#0d111a]/95 px-2.5 py-1.5 text-xs text-slate-100 select-none"
      >
        ${this._showDetails && this._breakdown
          ? html`
              <div
                class="absolute bottom-full left-0 right-0 mb-1.5 rounded-lg border border-amber-400/40 bg-[#0b0f18]/96 p-2.5 shadow-xl backdrop-blur-md text-[11px]"
              >
                <div
                  class="flex items-center justify-between border-b border-amber-400/20 pb-1 mb-1.5"
                >
                  <span class="font-semibold text-amber-300 tracking-wide">
                    ${translateText("crownfall.stability_breakdown")}
                  </span>
                  <span class="text-slate-300">
                    ${translateText("crownfall.stability_target")}:
                    <strong class="text-amber-200"
                      >${this._breakdown.target}%</strong
                    >
                  </span>
                </div>
                <div class="grid grid-cols-2 gap-x-4 gap-y-0.5 text-slate-300">
                  <div class="flex justify-between">
                    <span>${translateText("crownfall.factor_base")}</span>
                    <span class="text-slate-100">${this._breakdown.base}</span>
                  </div>
                  <div class="flex justify-between">
                    <span>${translateText("crownfall.factor_tax")}</span>
                    <span
                      class="${this._breakdown.tax >= 0
                        ? "text-emerald-400"
                        : "text-rose-400"}"
                      >${this._breakdown.tax >= 0 ? "+" : ""}${this._breakdown
                        .tax}</span
                    >
                  </div>
                  <div class="flex justify-between">
                    <span>${translateText("crownfall.factor_services")}</span>
                    <span class="text-emerald-400"
                      >+${this._breakdown.publicServices}</span
                    >
                  </div>
                  <div class="flex justify-between">
                    <span>${translateText("crownfall.factor_housing")}</span>
                    <span
                      class="${this._breakdown.housing >= 0
                        ? "text-emerald-400"
                        : "text-rose-400"}"
                      >${this._breakdown.housing >= 0 ? "+" : ""}${this
                        ._breakdown.housing}</span
                    >
                  </div>
                  <div class="flex justify-between">
                    <span>${translateText("crownfall.factor_war")}</span>
                    <span class="text-rose-400"
                      >${this._breakdown.warStrain}</span
                    >
                  </div>
                  <div class="flex justify-between">
                    <span>${translateText("crownfall.factor_expansion")}</span>
                    <span class="text-rose-400"
                      >${this._breakdown.overexpansion}</span
                    >
                  </div>
                </div>
              </div>
            `
          : nothing}

        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-3">
            <!-- Civilians -->
            <div
              class="flex items-center gap-1"
              title="${translateText("crownfall.civilians_tooltip")}"
            >
              <span class="text-amber-300/90 font-semibold">
                ${translateText("crownfall.civilians_short")}
              </span>
              <span class="font-mono font-semibold text-white">
                ${renderNumber(this._civilians)}
              </span>
              <span class="text-[10px] text-slate-400">
                /${renderNumber(this._civilianCap)}
              </span>
            </div>

            <!-- Stability -->
            <button
              type="button"
              @click=${() => this.toggleDetails()}
              class="flex items-center gap-1 rounded border px-1.5 py-0.5 transition hover:brightness-110 cursor-pointer ${bandColor}"
              title="${translateText("crownfall.stability_tooltip")}"
            >
              <span class="font-semibold">${this._stability}%</span>
              <span class="text-[10px] uppercase tracking-wider opacity-90">
                ${translateText(`crownfall.band_${band}`)}
              </span>
              <span class="font-bold ${trendColor}">${trend}</span>
            </button>

            <!-- Science -->
            <div
              class="flex items-center gap-1"
              title="${translateText("crownfall.science_tooltip")}"
            >
              <span class="text-sky-300 font-semibold">
                ${translateText("crownfall.science_short")}
              </span>
              <span class="font-mono font-semibold text-sky-100">
                ${renderNumber(this._science)}
              </span>
              ${this._scienceRate > 0
                ? html`<span class="text-[10px] text-sky-400"
                    >+${this._scienceRate}/s</span
                  >`
                : nothing}
            </div>
          </div>

          <!-- Tax selector -->
          <div class="flex items-center gap-1">
            <span class="text-[10px] uppercase tracking-wider text-amber-300/80">
              ${translateText("crownfall.tax_label")}
            </span>
            <div
              class="inline-flex rounded border border-amber-400/25 bg-slate-900/90 p-0.5"
            >
              ${taxButtons.map(
                ({ rate, labelKey }) => html`
                  <button
                    type="button"
                    @click=${() => this.setTaxRate(rate)}
                    class="px-1.5 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${this
                      ._taxRate === rate
                      ? "bg-amber-500/90 text-slate-950 shadow-sm"
                      : "text-slate-300 hover:text-amber-200"}"
                  >
                    ${translateText(labelKey)}
                  </button>
                `,
              )}
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
