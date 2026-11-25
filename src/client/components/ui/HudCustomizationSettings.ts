import { html } from "lit";
import type { HudPosition, HudScale, UserSettings } from "../../UserSettings";
import "../baseComponents/setting/SettingToggle";

const DOCK_OPTIONS: ReadonlyArray<{
  id: HudPosition;
  label: string;
  desc: string;
}> = [
  {
    id: "bottom",
    label: "Bottom Dock",
    desc: "Classic wide sovereign bar at the bottom center",
  },
  {
    id: "left",
    label: "Left Rail",
    desc: "Vertical tactical command rail docked on the left",
  },
  {
    id: "right",
    label: "Right Rail",
    desc: "Vertical tactical command rail docked on the right",
  },
];

const SCALE_OPTIONS: ReadonlyArray<{ id: HudScale; label: string }> = [
  { id: "compact", label: "Compact" },
  { id: "normal", label: "Normal" },
  { id: "large", label: "Large" },
];

function renderDockPreview(pos: HudPosition, active: boolean) {
  const barColor = active ? "bg-[#f5d061]" : "bg-slate-400/70";
  if (pos === "bottom") {
    return html`
      <div
        class="relative w-16 h-10 rounded-md border border-white/15 bg-[#05080f] overflow-hidden shrink-0"
      >
        <div
          class="absolute bottom-1 left-1/2 -translate-x-1/2 w-10 h-2.5 rounded-sm ${barColor}"
        ></div>
      </div>
    `;
  }
  if (pos === "left") {
    return html`
      <div
        class="relative w-16 h-10 rounded-md border border-white/15 bg-[#05080f] overflow-hidden shrink-0"
      >
        <div
          class="absolute left-1 top-1/2 -translate-y-1/2 w-3.5 h-7 rounded-sm ${barColor}"
        ></div>
      </div>
    `;
  }
  return html`
    <div
      class="relative w-16 h-10 rounded-md border border-white/15 bg-[#05080f] overflow-hidden shrink-0"
    >
      <div
        class="absolute right-1 top-1/2 -translate-y-1/2 w-3.5 h-7 rounded-sm ${barColor}"
      ></div>
    </div>
  `;
}

/**
 * Crownfall Phase 8: In-game HUD layout customization controls (dock position,
 * HUD scale, and red notification dot alerts). Shared between the main menu
 * Settings and in-game Settings panels, applying changes live.
 */
export function hudCustomizationSettings(
  settings: UserSettings,
  onChanged?: () => void,
) {
  const currentPos = settings.hudPosition();
  const currentScale = settings.hudScale();
  const showDots = settings.hudNotificationDots();

  return html`
    <div
      class="flex flex-col w-full p-4 bg-white/5 border border-white/10 rounded-xl gap-4"
    >
      <div>
        <div class="text-white font-bold text-base mb-1">
          In-Game HUD Layout
        </div>
        <div class="text-white/55 text-sm leading-snug">
          Choose where the Sovereign Command HUD docks during a match. Changes
          apply immediately.
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        ${DOCK_OPTIONS.map((opt) => {
          const active = currentPos === opt.id;
          return html`
            <button
              type="button"
              class="flex flex-col items-center text-center gap-2 p-3 rounded-xl border transition-all cursor-pointer ${active
                ? "border-[#d4af37] bg-[#d4af37]/14 text-white shadow-[0_0_20px_rgba(212,175,55,0.22)]"
                : "border-white/10 bg-[#0b101b]/70 text-slate-300 hover:border-white/25 hover:bg-white/10"}"
              @click=${() => {
                settings.setHudPosition(opt.id);
                onChanged?.();
              }}
            >
              ${renderDockPreview(opt.id, active)}
              <div class="text-sm font-bold ${active ? "text-[#f5d061]" : "text-white"}">
                ${opt.label}
              </div>
              <div class="text-[11px] text-slate-400 leading-tight">
                ${opt.desc}
              </div>
            </button>
          `;
        })}
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
        <div>
          <div class="text-white font-semibold text-sm">HUD Size</div>
          <div class="text-white/50 text-xs">
            Adjust the overall scale of the in-game command panel.
          </div>
        </div>
        <div class="inline-flex rounded-lg border border-white/15 bg-[#090d16] p-1 gap-1">
          ${SCALE_OPTIONS.map((opt) => {
            const active = currentScale === opt.id;
            return html`
              <button
                type="button"
                class="px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${active
                  ? "bg-[#d4af37] text-[#080b12]"
                  : "text-slate-300 hover:text-white hover:bg-white/10"}"
                @click=${() => {
                  settings.setHudScale(opt.id);
                  onChanged?.();
                }}
              >
                ${opt.label}
              </button>
            `;
          })}
        </div>
      </div>

      <setting-toggle
        label="HUD Action Alerts"
        description="Show pulsing red notification dots on Buildings, Paths, and Operations when new upgrades or actions are ready."
        id="hud-notification-dots-toggle"
        .checked=${showDots}
        @change=${(event: CustomEvent<{ checked: boolean }>) => {
          settings.setHudNotificationDots(Boolean(event.detail?.checked));
          onChanged?.();
        }}
      ></setting-toggle>
    </div>
  `;
}
