import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";

@customElement("main-layout")
export class MainLayout extends LitElement {
  private _initialChildren: Node[] = [];

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    if (this._initialChildren.length === 0 && this.childNodes.length > 0) {
      this._initialChildren = Array.from(this.childNodes);
    }
    super.connectedCallback();
  }

  render() {
    return html`
      <main
        class="relative [.in-game_&]:hidden flex flex-col flex-1 min-h-0 w-full px-0 lg:px-8 xl:px-14 pt-0 pb-0 in-[.page-open]:compact:p-0!"
      >
        <div
          class="w-full max-w-[92rem] mx-auto flex flex-col flex-1 min-h-0 gap-0 overflow-x-clip sm:px-4 lg:px-0 in-[.page-open]:compact:max-xl:max-w-none! in-[.page-open]:compact:max-xl:px-0!"
        >
          ${this._initialChildren}
        </div>
      </main>
    `;
  }
}
