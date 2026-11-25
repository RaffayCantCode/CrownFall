import { html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";

export interface CrownfallAccount {
  id: string;
  username: string;
  commanderName: string;
}

/**
 * Crownfall Account Modal backed by Cloudflare Pages Functions + Cloudflare D1
 * (`/api/auth/register`, `/api/auth/login`, `/api/auth/me`, `/api/auth/profile`,
 * `/api/auth/logout`). Allows players to register an account so their Commander
 * Name is saved persistently across devices.
 */
@customElement("crownfall-account-modal")
export class CrownfallAccountModal extends LitElement {
  @state() private isOpen = false;
  @state() private mode: "login" | "register" = "register";
  @state() private account: CrownfallAccount | null = null;
  @state() private usernameInput = "";
  @state() private passwordInput = "";
  @state() private commanderInput = "";
  @state() private busy = false;
  @state() private errorMessage = "";
  @state() private statusMessage = "";

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    void this.refreshAccount();
  }

  public open(initialCommanderName?: string) {
    this.isOpen = true;
    this.errorMessage = "";
    this.statusMessage = "";
    if (!this.account && initialCommanderName && !this.commanderInput) {
      this.commanderInput = initialCommanderName;
    } else if (this.account) {
      this.commanderInput = this.account.commanderName;
    }
    this.requestUpdate();
  }

  public close() {
    this.isOpen = false;
    this.errorMessage = "";
    this.statusMessage = "";
    this.requestUpdate();
  }

  public async refreshAccount(): Promise<CrownfallAccount | null> {
    try {
      const res = await fetch("/api/auth/me", { credentials: "same-origin" });
      if (!res.ok) return null;
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) return null;
      const data = (await res.json()) as { account?: CrownfallAccount | null };
      this.setAccount(data.account ?? null);
      return this.account;
    } catch {
      return null;
    }
  }

  private setAccount(account: CrownfallAccount | null) {
    this.account = account;
    if (account) {
      this.commanderInput = account.commanderName;
    }
    this.dispatchEvent(
      new CustomEvent("crownfall-account-changed", {
        detail: { account },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private async handleSubmitAuth(e: Event) {
    e.preventDefault();
    if (this.busy) return;
    this.busy = true;
    this.errorMessage = "";
    this.statusMessage = "";

    const endpoint =
      this.mode === "register" ? "/api/auth/register" : "/api/auth/login";
    const payload =
      this.mode === "register"
        ? {
            username: this.usernameInput.trim(),
            password: this.passwordInput,
            commanderName:
              this.commanderInput.trim() || this.usernameInput.trim(),
          }
        : {
            username: this.usernameInput.trim(),
            password: this.passwordInput,
          };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        this.errorMessage =
          "Account API is only active when deployed on Cloudflare Pages with a D1 `DB` binding.";
        return;
      }
      const data = (await res.json()) as {
        account?: CrownfallAccount;
        error?: string;
      };
      if (!res.ok || !data.account) {
        this.errorMessage = data.error ?? "Authentication failed.";
        return;
      }
      this.passwordInput = "";
      this.setAccount(data.account);
      this.statusMessage =
        this.mode === "register"
          ? "Account created & Commander Name saved!"
          : "Signed in! Saved Commander Name loaded.";
    } catch {
      this.errorMessage =
        "Could not reach the account backend. Make sure D1 is bound on Cloudflare Pages.";
    } finally {
      this.busy = false;
    }
  }

  private async handleSaveProfile(e: Event) {
    e.preventDefault();
    if (this.busy || !this.account) return;
    this.busy = true;
    this.errorMessage = "";
    this.statusMessage = "";
    try {
      const res = await fetch("/api/auth/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ commanderName: this.commanderInput.trim() }),
      });
      const data = (await res.json()) as {
        account?: CrownfallAccount;
        error?: string;
      };
      if (!res.ok || !data.account) {
        this.errorMessage = data.error ?? "Failed to update name.";
        return;
      }
      this.setAccount(data.account);
      this.statusMessage = "Commander Name saved to your account!";
    } catch {
      this.errorMessage = "Could not save Commander Name.";
    } finally {
      this.busy = false;
    }
  }

  private async handleLogout() {
    if (this.busy) return;
    this.busy = true;
    this.errorMessage = "";
    this.statusMessage = "";
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      this.setAccount(null);
      this.statusMessage = "Signed out.";
    } catch {
      this.errorMessage = "Failed to sign out.";
    } finally {
      this.busy = false;
    }
  }

  render() {
    if (!this.isOpen) return nothing;

    return html`
      <div
        class="fixed inset-0 z-[10050] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
        @click=${(e: MouseEvent) => {
          if (e.target === e.currentTarget) this.close();
        }}
      >
        <div
          class="w-full max-w-md rounded-2xl border border-[#d4af37]/40 bg-[#080b12]/98 p-6 text-[#f4f1ea] shadow-[0_24px_80px_rgba(0,0,0,0.92)]"
        >
          <div class="flex items-center justify-between mb-4">
            <div>
              <h2
                class="text-xl font-bold tracking-wide text-[#f5d061] m-0"
                style="font-family: Georgia, 'Times New Roman', serif;"
              >
                Crownfall Account
              </h2>
              <p class="text-xs text-slate-400 mt-0.5 mb-0">
                Save your Commander Name permanently in Cloudflare D1
              </p>
            </div>
            <button
              type="button"
              @click=${() => this.close()}
              class="h-8 w-8 rounded-full border border-white/15 bg-white/5 text-slate-300 hover:text-white hover:bg-white/15 cursor-pointer"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          ${this.errorMessage
            ? html`<div
                class="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 py-2.5 text-xs text-rose-200"
              >
                ${this.errorMessage}
              </div>`
            : nothing}
          ${this.statusMessage
            ? html`<div
                class="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2.5 text-xs text-emerald-200"
              >
                ${this.statusMessage}
              </div>`
            : nothing}
          ${this.account
            ? html`
                <form
                  @submit=${(e: Event) => void this.handleSaveProfile(e)}
                  class="flex flex-col gap-4"
                >
                  <div
                    class="rounded-xl border border-[#d4af37]/30 bg-[#0d121c] px-4 py-3 flex items-center justify-between"
                  >
                    <div>
                      <div class="text-[11px] uppercase tracking-wider text-slate-400">
                        Signed in as
                      </div>
                      <div class="text-sm font-bold text-[#f5d061]">
                        @${this.account.username}
                      </div>
                    </div>
                    <span
                      class="rounded-full bg-emerald-500/15 border border-emerald-400/35 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300"
                    >
                      Synced
                    </span>
                  </div>

                  <label class="flex flex-col gap-1.5">
                    <span class="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Saved Commander Name
                    </span>
                    <input
                      type="text"
                      maxlength="24"
                      .value=${this.commanderInput}
                      @input=${(e: Event) => {
                        this.commanderInput = (
                          e.target as HTMLInputElement
                        ).value;
                      }}
                      class="h-11 rounded-xl border border-white/15 bg-[#0d121c] px-3.5 text-sm text-white focus:border-[#d4af37] focus:outline-none"
                      required
                    />
                  </label>

                  <div class="flex items-center gap-2.5 pt-1">
                    <button
                      type="submit"
                      ?disabled=${this.busy}
                      class="flex-1 h-11 rounded-full bg-gradient-to-b from-[#efd077] to-[#b8860b] text-[#080b12] font-bold text-sm tracking-wide hover:brightness-110 transition cursor-pointer disabled:opacity-50"
                    >
                      ${this.busy ? "Saving..." : "Save Name"}
                    </button>
                    <button
                      type="button"
                      ?disabled=${this.busy}
                      @click=${() => void this.handleLogout()}
                      class="h-11 px-5 rounded-full border border-white/15 bg-white/5 text-slate-200 text-sm font-semibold hover:bg-white/15 transition cursor-pointer disabled:opacity-50"
                    >
                      Sign Out
                    </button>
                  </div>
                </form>
              `
            : html`
                <div class="grid grid-cols-2 gap-1.5 rounded-xl bg-[#0d121c] p-1 mb-4 border border-white/10">
                  <button
                    type="button"
                    @click=${() => {
                      this.mode = "register";
                      this.errorMessage = "";
                    }}
                    class="py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition cursor-pointer ${this
                      .mode === "register"
                      ? "bg-[#d4af37] text-[#080b12]"
                      : "text-slate-300 hover:text-white"}"
                  >
                    Create Account
                  </button>
                  <button
                    type="button"
                    @click=${() => {
                      this.mode = "login";
                      this.errorMessage = "";
                    }}
                    class="py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition cursor-pointer ${this
                      .mode === "login"
                      ? "bg-[#d4af37] text-[#080b12]"
                      : "text-slate-300 hover:text-white"}"
                  >
                    Sign In
                  </button>
                </div>

                <form
                  @submit=${(e: Event) => void this.handleSubmitAuth(e)}
                  class="flex flex-col gap-3.5"
                >
                  <label class="flex flex-col gap-1">
                    <span class="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Username
                    </span>
                    <input
                      type="text"
                      maxlength="24"
                      placeholder="3–24 letters, numbers, _ or -"
                      .value=${this.usernameInput}
                      @input=${(e: Event) => {
                        this.usernameInput = (
                          e.target as HTMLInputElement
                        ).value;
                      }}
                      class="h-11 rounded-xl border border-white/15 bg-[#0d121c] px-3.5 text-sm text-white focus:border-[#d4af37] focus:outline-none"
                      required
                    />
                  </label>

                  ${this.mode === "register"
                    ? html`
                        <label class="flex flex-col gap-1">
                          <span class="text-xs font-semibold uppercase tracking-wider text-slate-300">
                            In-Game Commander Name
                          </span>
                          <input
                            type="text"
                            maxlength="24"
                            placeholder="Displayed on the map & leaderboard"
                            .value=${this.commanderInput}
                            @input=${(e: Event) => {
                              this.commanderInput = (
                                e.target as HTMLInputElement
                              ).value;
                            }}
                            class="h-11 rounded-xl border border-white/15 bg-[#0d121c] px-3.5 text-sm text-white focus:border-[#d4af37] focus:outline-none"
                          />
                        </label>
                      `
                    : nothing}

                  <label class="flex flex-col gap-1">
                    <span class="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Password
                    </span>
                    <input
                      type="password"
                      minlength="6"
                      placeholder="At least 6 characters"
                      .value=${this.passwordInput}
                      @input=${(e: Event) => {
                        this.passwordInput = (
                          e.target as HTMLInputElement
                        ).value;
                      }}
                      class="h-11 rounded-xl border border-white/15 bg-[#0d121c] px-3.5 text-sm text-white focus:border-[#d4af37] focus:outline-none"
                      required
                    />
                  </label>

                  <button
                    type="submit"
                    ?disabled=${this.busy}
                    class="mt-1 h-11 w-full rounded-full bg-gradient-to-b from-[#efd077] to-[#b8860b] text-[#080b12] font-bold text-sm tracking-wide hover:brightness-110 transition cursor-pointer disabled:opacity-50"
                  >
                    ${this.busy
                      ? "Please wait..."
                      : this.mode === "register"
                        ? "Create Account & Save Name"
                        : "Sign In"}
                  </button>
                </form>
              `}
        </div>
      </div>
    `;
  }
}
