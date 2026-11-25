import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";

@customElement("desktop-nav-bar")
export class DesktopNavBar extends LitElement {
  createRenderRoot() {
    return this;
  }

  render() {
    // Hidden on Crownfall's full-screen PC-style title screen; kept as a
    // registered element with data-page="page-play" so Main.ts page routing works.
    return html`
      <nav class="hidden" aria-hidden="true">
        <button
          type="button"
          class="nav-menu-item active"
          data-page="page-play"
        ></button>
        <span id="game-version"></span>
      </nav>
    `;
  }
}
