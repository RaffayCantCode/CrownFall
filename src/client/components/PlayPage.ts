import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";

@customElement("play-page")
export class PlayPage extends LitElement {
  createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <div
        id="page-play"
        class="relative flex flex-col justify-center w-full min-h-dvh px-6 sm:px-12 lg:px-16 xl:px-24 py-8 overflow-x-hidden"
      >
        <token-login class="absolute"></token-login>
        <rewards-modal class="absolute"></rewards-modal>

        <!-- Hidden mobile hamburger hook kept for Main.ts listener compatibility -->
        <button id="hamburger-btn" class="hidden" aria-hidden="true"></button>

        <!-- Wide Full-Viewport PC Strategy Title Screen -->
        <game-mode-selector class="block w-full"></game-mode-selector>
      </div>
    `;
  }
}
