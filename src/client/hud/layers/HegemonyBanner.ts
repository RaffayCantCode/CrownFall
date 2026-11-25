import {
  GameUpdateType,
  type HegemonyUpdate,
} from "@openfront/engine-api/game/GameUpdates";
import { assetUrl } from "@openfront/shared/AssetUrls";
import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { Controller } from "../../Controller";
import { GameView } from "../../view";

/**
 * Crownfall Phase 7: Top-center Stable Hegemony Victory countdown banner.
 * Appears whenever a nation or team crosses the territory threshold while
 * opponents remain alive, displaying live countdown progress, stability gate
 * (>= 50%), and stall/decay warnings.
 */
@customElement("hegemony-banner")
export class HegemonyBanner extends LitElement implements Controller {
  public game: GameView;

  @state()
  private hegemony: HegemonyUpdate | null = null;

  @state()
  private isVisible = false;

  createRenderRoot() {
    return this;
  }

  init() {
    this.isVisible = true;
    this.hegemony = null;
    this.requestUpdate();
    return () => {
      this.isVisible = false;
      this.hegemony = null;
      this.requestUpdate();
    };
  }

  tick() {
    if (!this.game || !this.isVisible) return;
    const updates = this.game.updatesSinceLastTick()?.[GameUpdateType.Hegemony];
    if (!updates || updates.length === 0) return;

    const latest = updates[updates.length - 1];
    if (!latest.active) {
      if (this.hegemony !== null) {
        this.hegemony = null;
        this.requestUpdate();
      }
      return;
    }

    this.hegemony = latest;
    this.requestUpdate();
  }

  private formatCountdown(secondsLeft: number): string {
    const clamped = Math.max(0, Math.ceil(secondsLeft));
    const mins = Math.floor(clamped / 60);
    const secs = clamped % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  render() {
    if (!this.isVisible || !this.hegemony || !this.hegemony.active) {
      return nothing;
    }

    const h = this.hegemony;
    const myPlayer = this.game?.myPlayer();
    const isMyHolder =
      (h.holderPlayerID !== null &&
        myPlayer !== null &&
        myPlayer !== undefined &&
        myPlayer.smallID() === h.holderPlayerID) ||
      (h.holderTeam !== null &&
        myPlayer !== null &&
        myPlayer !== undefined &&
        myPlayer.team() === h.holderTeam);

    const remaining = Math.max(0, h.requiredSeconds - h.heldSeconds);
    const pct = Math.min(
      100,
      Math.max(0, Math.round((h.heldSeconds / Math.max(1, h.requiredSeconds)) * 100)),
    );

    const borderClass = h.stalled
      ? "border-rose-400/60 shadow-[0_12px_36px_rgba(244,63,94,0.28)]"
      : h.decaying
        ? "border-amber-400/50 shadow-[0_12px_36px_rgba(245,158,11,0.22)]"
        : "border-[#d4af37]/65 shadow-[0_14px_42px_rgba(212,175,55,0.28)]";

    const barClass = h.stalled
      ? "bg-gradient-to-r from-rose-600 to-rose-400"
      : h.decaying
        ? "bg-gradient-to-r from-amber-600 to-amber-400"
        : "bg-gradient-to-r from-[#b8860b] via-[#d4af37] to-[#f5d061]";

    const statusLine = h.stalled
      ? isMyHolder
        ? `STALLED — Raise Stability to ${h.minStability}%+ to resume victory countdown`
        : `${h.holderName} is unstable (${h.stability}% < ${h.minStability}%) — countdown stalled!`
      : h.decaying
        ? "Territory contested — Hegemony progress decaying"
        : isMyHolder
          ? `Hold territory & Stability ≥ ${h.minStability}% to claim the Crown`
          : `Destabilize or reclaim land from ${h.holderName} before time expires!`;

    return html`
      <div
        class="fixed top-4 left-1/2 -translate-x-1/2 z-[1050] pointer-events-none w-[min(94vw,460px)]"
      >
        <div
          class="bg-[#080b12]/94 backdrop-blur-md border ${borderClass} rounded-xl px-4 py-3 text-[#f4f1ea]"
        >
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2.5 min-w-0">
              <div
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#d4af37]/45 bg-[#d4af37]/10"
              >
                <img
                  src=${assetUrl("images/crownfall/victory-crown.svg")}
                  alt=""
                  class="h-4.5 w-4.5 object-contain"
                  draggable="false"
                />
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span
                    class="text-[11px] font-bold tracking-[0.16em] uppercase ${h.stalled
                      ? "text-rose-300"
                      : "text-[#f5d061]"}"
                  >
                    ${h.stalled
                      ? "Hegemony Stalled"
                      : h.decaying
                        ? "Hegemony Decaying"
                        : "Stable Hegemony"}
                  </span>
                  ${isMyHolder
                    ? html`<span
                        class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/35"
                      >
                        YOU
                      </span>`
                    : nothing}
                </div>
                <div class="text-sm font-semibold text-white truncate">
                  ${h.holderName}
                </div>
              </div>
            </div>

            <div class="flex items-center gap-3 shrink-0 tabular-nums">
              <div class="text-right">
                <div class="text-[10px] uppercase tracking-wider text-slate-400">
                  Stability
                </div>
                <div
                  class="text-xs font-bold ${h.stability >= h.minStability
                    ? "text-emerald-400"
                    : "text-rose-400"}"
                >
                  ${h.stability}% / ${h.minStability}%
                </div>
              </div>
              <div
                class="px-2.5 py-1 rounded-lg border ${h.stalled
                  ? "border-rose-400/45 bg-rose-500/15 text-rose-200"
                  : "border-[#d4af37]/45 bg-[#d4af37]/12 text-[#f5d061]"} text-base font-bold font-mono"
              >
                ${this.formatCountdown(remaining)}
              </div>
            </div>
          </div>

          <div
            class="mt-2.5 h-2 w-full rounded-full bg-slate-800/90 overflow-hidden border border-white/10"
          >
            <div
              class="h-full ${barClass} transition-all duration-300"
              style="width: ${pct}%"
            ></div>
          </div>

          <div
            class="mt-1.5 text-[11px] ${h.stalled
              ? "text-rose-300"
              : h.decaying
                ? "text-amber-300"
                : "text-slate-300"} leading-snug"
          >
            ${statusLine}
          </div>
        </div>
      </div>
    `;
  }
}
