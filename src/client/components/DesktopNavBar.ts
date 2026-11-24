import { assetUrl } from "@openfront/shared/AssetUrls";
import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import "./NavAccountMenu";
import { NavNotificationsController } from "./NavNotificationsController";
import "./NavUtilityIcons";

@customElement("desktop-nav-bar")
export class DesktopNavBar extends LitElement {
  private _notifications = new NavNotificationsController(this);

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("showPage", this._onShowPage);

    const current = window.currentPageId;
    if (current) {
      // Wait for render
      void this.updateComplete.then(() => {
        this._updateActiveState(current);
      });
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("showPage", this._onShowPage);
  }

  private _onShowPage = (e: Event) => {
    const pageId = (e as CustomEvent).detail;
    this._updateActiveState(pageId);
  };

  private _updateActiveState(pageId: string) {
    this.querySelectorAll(".nav-menu-item").forEach((el) => {
      if ((el as HTMLElement).dataset.page === pageId) {
        el.classList.add("active");
      } else {
        el.classList.remove("active");
      }
    });
  }

  render() {
    window.currentPageId ??= "page-play";
    const currentPage = window.currentPageId;

    // Scaled to 3/4 on compact screens (styles.css), e.g. Poki's frame. The bar,
    // not the sticky host, so the host's offset below a header ad stays exact.
    return html`
      <nav
        class="hidden lg:flex w-full bg-[#0b0e14]/92 border-b border-amber-400/25 backdrop-blur-md items-center justify-center gap-8 py-3.5 shrink-0 z-50 relative compact:[zoom:0.75]"
      >
        <div class="flex flex-col items-center justify-center">
          <div class="flex items-center gap-2.5">
            <img
              class="block h-7 w-7 object-contain drop-shadow-[0_0_8px_rgba(212,175,55,0.45)]"
              src=${assetUrl("images/CrownfallCrownIcon.svg")}
              alt="Crownfall"
            />
            <span
              class="text-xl font-extrabold tracking-[0.18em] uppercase bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 bg-clip-text text-transparent"
            >
              CROWNFALL
            </span>
          </div>
          <div
            id="game-version"
            class="l-header__highlightText text-center text-amber-200/60"
          ></div>
        </div>
        <button
          class="nav-menu-item ${
            currentPage === "page-play" ? "active" : ""
          } text-white/70 hover:text-malibu-blue  font-medium tracking-wider uppercase cursor-pointer transition-colors [&.active]:text-malibu-blue "
          data-page="page-play"
          data-i18n="main.play"
        ></button>
        <!-- Desktop Navigation Menu Items -->
        <div class="relative no-game-portal">
          <button
            class="nav-menu-item ${
              currentPage === "page-item-store" ? "active" : ""
            } text-white/70 hover:text-malibu-blue  font-medium tracking-wider uppercase cursor-pointer transition-colors [&.active]:text-malibu-blue "
            data-page="page-item-store"
            data-i18n="main.store"
            @click=${this._notifications.onStoreClick}
          ></button>
          ${
            this._notifications.showStoreDot()
              ? html`
                  <span
                    class="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-ping"
                  ></span>
                  <span
                    class="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"
                  ></span>
                `
              : ""
          }
        </div>
        <button
          class="nav-menu-item ${
            currentPage === "page-inventory" ? "active" : ""
          } text-white/70 hover:text-malibu-blue font-medium tracking-wider uppercase cursor-pointer transition-colors [&.active]:text-malibu-blue"
          data-page="page-inventory"
          data-i18n="main.inventory"
        ></button>
        <button
          class="nav-menu-item text-white/70 hover:text-malibu-blue  font-medium tracking-wider uppercase cursor-pointer transition-colors [&.active]:text-malibu-blue "
          data-page="page-leaderboard"
          data-i18n="main.leaderboard"
        ></button>
        <button
          class="no-game-portal nav-menu-item text-white/70 hover:text-blue-500 font-medium tracking-wider uppercase cursor-pointer transition-colors [&.active]:text-blue-500"
          data-page="page-clan"
          data-i18n="main.clans"
        ></button>
        <!-- Utility cluster: bell, help, settings and the profile control are
             account/notification/utility affordances rather than page links,
             so they sit tight together behind a divider instead of in the nav
             item list. -->
        <div class="flex items-center gap-1 pl-5 ml-1 border-l border-white/10">
          <nav-utility-icons size="desktop"></nav-utility-icons>
          <nav-account-menu variant="desktop"></nav-account-menu>
        </div>
      </nav>
    `;
  }
}
