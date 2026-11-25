import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";

@customElement("page-footer")
export class Footer extends LitElement {
  createRenderRoot() {
    return this;
  }

  render() {
    // Minimal floating legal & language corner bar so the title screen feels
    // like a standalone PC strategy game rather than a scrolling website.
    // Single <lang-selector> instance is preserved for translateText().
    return html`
      <footer
        class="[.in-game_&]:hidden fixed bottom-3 right-4 z-40 flex items-center gap-3 text-[11px] text-[#9aa3b2]/60 pointer-events-auto"
      >
        <span class="hidden sm:inline tracking-wide">
          © Crownfall · AGPL-3.0 · Icons: game-icons.net (CC BY 3.0)
        </span>
        <div class="opacity-75 hover:opacity-100 transition-opacity">
          <lang-selector></lang-selector>
        </div>
      </footer>
    `;
  }
}
