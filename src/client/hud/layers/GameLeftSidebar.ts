import { GameMode, type Team } from "@openfront/engine-api/game/GameTypes";
import { assetUrl } from "@openfront/shared/AssetUrls";
import type { EventBus } from "@openfront/shared/EventBus";
import { Colord } from "colord";
import { html, LitElement } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { isCompactViewport } from "../../CompactViewport";
import type { Controller } from "../../Controller";
import { Platform } from "../../Platform";
import { themeProvider } from "../../theme/ThemeProvider";
import { getTranslatedPlayerTeamLabel, translateText } from "../../Utils";
import type { GameView } from "../../view";
import { ImmunityBarVisibleEvent } from "./ImmunityTimer";
import "./PlayerStats";
import type { PlayerStats } from "./PlayerStats";
import { SpawnBarVisibleEvent } from "./SpawnTimer";
import "./TeamStats";
import type { TeamStats } from "./TeamStats";
const teamStatsRegularIcon = assetUrl("images/TeamIconRegularWhite.svg");
const teamStatsSolidIcon = assetUrl("images/TeamIconSolidWhite.svg");

@customElement("game-left-sidebar")
export class GameLeftSidebar extends LitElement implements Controller {
  @state()
  private isPlayerStatsShown = false;
  @state()
  private isTeamStatsShown = false;
  @state()
  private isVisible = false;
  @state()
  private isPlayerTeamLabelVisible = false;
  @state()
  private playerTeam: Team | null = null;
  @state()
  private spawnBarVisible = false;
  @state()
  private immunityBarVisible = false;

  private playerColor: Colord = new Colord("#FFFFFF");
  @property({ attribute: false }) public game: GameView | null = null;
  @property({ attribute: false }) public eventBus: EventBus | null = null;
  @query("player-stats") private playerStats?: PlayerStats;
  @query("team-stats") private teamStats?: TeamStats;
  private showPlayerStatsAfterSpawn = false;

  createRenderRoot() {
    return this;
  }

  init() {
    this.isVisible = true;
    this.eventBus?.on(SpawnBarVisibleEvent, (e) => {
      this.spawnBarVisible = e.visible;
    });
    this.eventBus?.on(ImmunityBarVisibleEvent, (e) => {
      this.immunityBarVisible = e.visible;
    });
    if (this.isTeamGame) {
      this.isPlayerTeamLabelVisible = true;
    }
    // Make it visible by default on large screens; compact ones (short laptops,
    // Poki's frame) need the room for the map.
    if (Platform.isDesktopWidth && !isCompactViewport()) {
      this.showPlayerStatsAfterSpawn = true;
    }
  }

  getTickIntervalMs() {
    return 1000;
  }

  tick() {
    if (this.game === null) return;

    const team = this.game.myPlayer()?.team();
    if (this.playerTeam === null && team !== null && team !== undefined) {
      this.playerTeam = team;
      this.playerColor = themeProvider.current().teamColor(team);
    }

    if (this.showPlayerStatsAfterSpawn && !this.game.inSpawnPhase()) {
      this.showPlayerStatsAfterSpawn = false;
      this.isPlayerStatsShown = true;
    }

    if (!this.game.inSpawnPhase() && this.isPlayerTeamLabelVisible) {
      this.isPlayerTeamLabelVisible = false;
    }

    this.playerStats?.refresh();
    this.teamStats?.refresh();
  }

  private get barOffset(): number {
    return (this.spawnBarVisible ? 7 : 0) + (this.immunityBarVisible ? 7 : 0);
  }

  private togglePlayerStats(): void {
    this.isPlayerStatsShown = !this.isPlayerStatsShown;
  }

  private toggleTeamStats(): void {
    this.isTeamStatsShown = !this.isTeamStatsShown;
  }

  private get isTeamGame(): boolean {
    return this.game?.config().gameConfig().gameMode === GameMode.Team;
  }

  render() {
    const crownIcon = assetUrl("images/crownfall/logo-crown.svg");
    return html`
      <aside
        class=${`max-lg:fixed max-lg:top-0 max-lg:left-0 max-lg:z-900 lg:pointer-events-auto flex flex-col max-h-[calc(100vh-96px)] overflow-y-auto lg:ml-2 lg:mt-2 p-2.5 bg-[#080b12]/94 border border-[#d4af37]/30 backdrop-blur-md shadow-[0_14px_40px_rgba(0,0,0,0.75)] rounded-br-2xl lg:rounded-2xl ${this.isPlayerStatsShown || this.isTeamStatsShown ? "max-[400px]:w-full max-[400px]:rounded-none" : ""} transition-all duration-300 ease-out transform ${
          this.isVisible ? "translate-x-0" : "hidden"
        }`}
        style="margin-top: ${this.barOffset ? this.barOffset + 8 : 8}px;"
      >
        <div class="flex items-center gap-2.5 text-[#f4f1ea]">
          <div
            class="cursor-pointer inline-flex items-center gap-1.5 px-2 py-1 bg-[#121826] hover:bg-[#192234] border rounded-lg ${
              this.isPlayerStatsShown
                ? "border-[#d4af37]/60 text-[#f3d27a]"
                : "border-white/10 text-[#f4f1ea]"
            } transition-colors"
            @click=${this.togglePlayerStats}
            role="button"
            tabindex="0"
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " " || e.code === "Space") {
                e.preventDefault();
                this.togglePlayerStats();
              }
            }}
          >
            <img
              src=${crownIcon}
              alt=${
                translateText("help_modal.icon_alt_player_leaderboard") ||
                "Standings"
              }
              width="14"
              height="14"
              class="object-contain"
            />
            <span class="text-[11px] font-bold tracking-[0.14em] uppercase"
              >Standings</span
            >
          </div>
          ${
            this.isTeamGame
              ? html`
                  <div
                    class="cursor-pointer p-1 bg-[#121826] hover:bg-[#192234] border rounded-lg ${
                      this.isTeamStatsShown
                        ? "border-[#d4af37]/60"
                        : "border-white/10"
                    } transition-colors"
                    @click=${this.toggleTeamStats}
                    role="button"
                    tabindex="0"
                    @keydown=${(e: KeyboardEvent) => {
                      if (
                        e.key === "Enter" ||
                        e.key === " " ||
                        e.code === "Space"
                      ) {
                        e.preventDefault();
                        this.toggleTeamStats();
                      }
                    }}
                  >
                    <img
                      src=${
                        this.isTeamStatsShown
                          ? teamStatsSolidIcon
                          : teamStatsRegularIcon
                      }
                      alt=${
                        translateText("help_modal.icon_alt_team_leaderboard") ||
                        "Team Leaderboard Icon"
                      }
                      width="16"
                      height="16"
                    />
                  </div>
                `
              : null
          }
          ${
            this.isPlayerStatsShown || this.isTeamStatsShown
              ? html`<span
                  class="ml-auto text-[10px] font-mono text-[#9aa3b2]/60 select-all leading-none"
                  title=${translateText("help_modal.game_id_tooltip")}
                  >${this.game?.gameID() ?? ""}</span
                >`
              : null
          }
        </div>
        ${
          this.isPlayerTeamLabelVisible
            ? html`
                <div
                  class="flex items-center w-full text-white mt-2"
                  @contextmenu=${(e: Event) => e.preventDefault()}
                >
                  ${translateText("help_modal.ui_your_team")}
                  <span
                    style="--color: ${this.playerColor.toRgbString()}"
                    class="text-(--color)"
                  >
                    &nbsp;${getTranslatedPlayerTeamLabel(
                      this.playerTeam,
                      this.game?.teamClanTag(this.playerTeam),
                    )}
                    &#10687;
                  </span>
                </div>
              `
            : null
        }
        <div class="flex flex-col gap-2 min-w-0 w-full">
          <player-stats
            class=${this.isPlayerStatsShown ? "block min-w-0" : "hidden"}
            .game=${this.game}
            .eventBus=${this.eventBus}
            .visible=${this.isPlayerStatsShown}
          ></player-stats>
          <team-stats
            class=${
              this.isTeamStatsShown && this.isTeamGame
                ? "block min-w-0"
                : "hidden"
            }
            .game=${this.game}
            .visible=${this.isTeamStatsShown && this.isTeamGame}
          ></team-stats>
        </div>
        <slot></slot>
      </aside>
    `;
  }
}
