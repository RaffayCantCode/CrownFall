/**
 * Crownfall D1 Database Adapter, Auto-Schema Initializer & In-Memory Isolate Fallback.
 *
 * When `env.DB` (Cloudflare D1) is bound, every query runs against real D1 SQLite
 * and automatically initializes all tables on first use.
 * When `env.DB` is not bound yet, an in-memory isolate store answers the same
 * prepared statements so multiplayer lobbies and testing still work immediately.
 */

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
}

export interface AssetsFetcherLike {
  fetch(request: Request | URL | string): Promise<Response>;
}

export interface CrownfallEnv {
  DB?: D1DatabaseLike;
  ASSETS?: AssetsFetcherLike;
  CF_PAGES_COMMIT_SHA?: string;
}

export interface PagesContext {
  request: Request;
  env: CrownfallEnv;
  params?: Record<string, string | string[]>;
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    commander_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    achievements_json TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_account_id ON sessions(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`,
  `CREATE TABLE IF NOT EXISTS mp_games (
    id TEXT PRIMARY KEY,
    public_type TEXT,
    creator_id TEXT,
    stage TEXT NOT NULL DEFAULT 'lobby',
    listed INTEGER NOT NULL DEFAULT 0,
    config_json TEXT NOT NULL,
    starts_at INTEGER,
    auto_start_at INTEGER,
    started_at INTEGER,
    game_start_info_json TEXT,
    successor_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mp_games_stage ON mp_games(stage, updated_at)`,
  `CREATE TABLE IF NOT EXISTS mp_clients (
    game_id TEXT NOT NULL,
    persistent_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    username TEXT NOT NULL,
    clan_tag TEXT,
    cosmetics_json TEXT NOT NULL DEFAULT '{}',
    spectator INTEGER NOT NULL DEFAULT 0,
    kicked INTEGER NOT NULL DEFAULT 0,
    joined_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    PRIMARY KEY (game_id, persistent_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mp_clients_game ON mp_clients(game_id, last_seen)`,
  `CREATE TABLE IF NOT EXISTS mp_intents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    turn_number INTEGER NOT NULL,
    intent_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mp_intents_game_turn ON mp_intents(game_id, turn_number, id)`,
  `CREATE TABLE IF NOT EXISTS mp_matchmaking (
    persistent_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    assigned_game_id TEXT,
    queued_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    PRIMARY KEY (persistent_id, mode)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mp_matchmaking_mode ON mp_matchmaking(mode, last_seen)`,
];

const initializedDbs = new WeakSet<object>();

async function ensureSchema(db: D1DatabaseLike): Promise<void> {
  if (initializedDbs.has(db)) return;
  for (const sql of SCHEMA_STATEMENTS) {
    await db.prepare(sql).run();
  }
  // Upgrade existing v1 `accounts` tables created before `achievements_json`
  try {
    await db
      .prepare(
        "ALTER TABLE accounts ADD COLUMN achievements_json TEXT NOT NULL DEFAULT '[]'",
      )
      .run();
  } catch {
    // Column already exists
  }
  initializedDbs.add(db);
}

// --- Lightweight In-Memory Fallback Store (when D1 `DB` is not yet bound) ---

interface AccountRow {
  id: string;
  username: string;
  commander_name: string;
  password_hash: string;
  achievements_json: string;
  created_at: number;
  updated_at: number;
}

interface SessionRow {
  token_hash: string;
  account_id: string;
  expires_at: number;
  created_at: number;
}

interface MpGameRow {
  id: string;
  public_type: string | null;
  creator_id: string | null;
  stage: string;
  listed: number;
  config_json: string;
  starts_at: number | null;
  auto_start_at: number | null;
  started_at: number | null;
  game_start_info_json: string | null;
  successor_id: string | null;
  created_at: number;
  updated_at: number;
}

interface MpClientRow {
  game_id: string;
  persistent_id: string;
  client_id: string;
  username: string;
  clan_tag: string | null;
  cosmetics_json: string;
  spectator: number;
  kicked: number;
  joined_at: number;
  last_seen: number;
}

interface MpIntentRow {
  id: number;
  game_id: string;
  turn_number: number;
  intent_json: string;
}

interface MpMatchmakingRow {
  persistent_id: string;
  mode: string;
  assigned_game_id: string | null;
  queued_at: number;
  last_seen: number;
}

class MemoryCrownfallDb implements D1DatabaseLike {
  accounts = new Map<string, AccountRow>();
  sessions = new Map<string, SessionRow>();
  games = new Map<string, MpGameRow>();
  clients = new Map<string, MpClientRow>(); // `${game_id}::${persistent_id}`
  intents: MpIntentRow[] = [];
  nextIntentId = 1;
  matchmaking = new Map<string, MpMatchmakingRow>(); // `${persistent_id}::${mode}`

  prepare(query: string): D1PreparedStatementLike {
    const normalized = query.replace(/\s+/g, " ").trim();
    let params: unknown[] = [];

    const stmt: D1PreparedStatementLike = {
      bind: (...values: unknown[]) => {
        params = values;
        return stmt;
      },
      first: async <T = Record<string, unknown>>(): Promise<T | null> => {
        const { results } = await stmt.all<T>();
        return results[0] ?? null;
      },
      all: async <T = Record<string, unknown>>(): Promise<{ results: T[] }> => {
        // Accounts queries
        if (normalized.startsWith("SELECT id FROM accounts WHERE username = ?")) {
          const u = String(params[0] ?? "").toLowerCase();
          for (const a of this.accounts.values()) {
            if (a.username.toLowerCase() === u) {
              return { results: [{ id: a.id } as unknown as T] };
            }
          }
          return { results: [] };
        }
        if (normalized.includes("FROM accounts WHERE username = ?")) {
          const u = String(params[0] ?? "").toLowerCase();
          for (const a of this.accounts.values()) {
            if (a.username.toLowerCase() === u) {
              return { results: [{ ...a } as unknown as T] };
            }
          }
          return { results: [] };
        }
        if (normalized.includes("FROM sessions s JOIN accounts a")) {
          const tokenHash = String(params[0] ?? "");
          const now = Number(params[1] ?? 0);
          const s = this.sessions.get(tokenHash);
          if (!s || s.expires_at <= now) return { results: [] };
          const a = this.accounts.get(s.account_id);
          if (!a) return { results: [] };
          return {
            results: [
              {
                id: a.id,
                username: a.username,
                commander_name: a.commander_name,
                achievements_json: a.achievements_json,
              } as unknown as T,
            ],
          };
        }
        // MP games queries
        if (normalized === "SELECT * FROM mp_games WHERE id = ?") {
          const g = this.games.get(String(params[0] ?? ""));
          return { results: g ? ([{ ...g } as unknown as T]) : [] };
        }
        if (
          normalized.startsWith(
            "SELECT * FROM mp_games WHERE stage = 'lobby'",
          )
        ) {
          const rows = [...this.games.values()]
            .filter((g) => g.stage === "lobby")
            .sort((a, b) => a.created_at - b.created_at);
          return { results: rows.map((g) => ({ ...g }) as unknown as T) };
        }
        // MP clients queries
        if (
          normalized.startsWith(
            "SELECT * FROM mp_clients WHERE game_id = ? AND persistent_id = ?",
          )
        ) {
          const row = this.clients.get(`${params[0]}::${params[1]}`);
          return { results: row ? ([{ ...row } as unknown as T]) : [] };
        }
        if (
          normalized.startsWith(
            "SELECT * FROM mp_clients WHERE game_id = ? AND kicked = 0 AND last_seen >= ?",
          )
        ) {
          const gid = String(params[0] ?? "");
          const cutoff = Number(params[1] ?? 0);
          const rows = [...this.clients.values()]
            .filter(
              (c) => c.game_id === gid && c.kicked === 0 && c.last_seen >= cutoff,
            )
            .sort((a, b) => a.joined_at - b.joined_at);
          return { results: rows.map((c) => ({ ...c }) as unknown as T) };
        }
        if (
          normalized.startsWith(
            "SELECT game_id, COUNT(*) as cnt FROM mp_clients WHERE kicked = 0 AND spectator = 0 AND last_seen >= ?",
          )
        ) {
          const cutoff = Number(params[0] ?? 0);
          const counts = new Map<string, number>();
          for (const c of this.clients.values()) {
            if (c.kicked === 0 && c.spectator === 0 && c.last_seen >= cutoff) {
              counts.set(c.game_id, (counts.get(c.game_id) ?? 0) + 1);
            }
          }
          return {
            results: [...counts.entries()].map(
              ([game_id, cnt]) => ({ game_id, cnt }) as unknown as T,
            ),
          };
        }
        // MP intents queries
        if (
          normalized.startsWith(
            "SELECT turn_number, intent_json FROM mp_intents WHERE game_id = ?",
          )
        ) {
          const gid = String(params[0] ?? "");
          const minTurn = Number(params[1] ?? 0);
          const maxTurn = Number(params[2] ?? 0);
          const rows = this.intents
            .filter(
              (i) =>
                i.game_id === gid &&
                i.turn_number >= minTurn &&
                i.turn_number <= maxTurn,
            )
            .sort((a, b) => a.turn_number - b.turn_number || a.id - b.id);
          return {
            results: rows.map(
              (r) =>
                ({
                  turn_number: r.turn_number,
                  intent_json: r.intent_json,
                }) as unknown as T,
            ),
          };
        }
        // Matchmaking queries
        if (
          normalized.startsWith(
            "SELECT * FROM mp_matchmaking WHERE persistent_id = ? AND mode = ?",
          )
        ) {
          const row = this.matchmaking.get(`${params[0]}::${params[1]}`);
          return { results: row ? ([{ ...row } as unknown as T]) : [] };
        }
        if (
          normalized.startsWith(
            "SELECT * FROM mp_matchmaking WHERE mode = ? AND last_seen >= ?",
          )
        ) {
          const mode = String(params[0] ?? "");
          const cutoff = Number(params[1] ?? 0);
          const rows = [...this.matchmaking.values()]
            .filter((r) => r.mode === mode && r.last_seen >= cutoff)
            .sort((a, b) => a.queued_at - b.queued_at);
          return { results: rows.map((r) => ({ ...r }) as unknown as T) };
        }
        return { results: [] };
      },
      run: async (): Promise<{ success: boolean; meta?: { changes?: number } }> => {
        if (
          normalized.startsWith("CREATE ") ||
          normalized.startsWith("ALTER ")
        ) {
          return { success: true, meta: { changes: 0 } };
        }
        if (normalized.startsWith("INSERT INTO accounts")) {
          const [
            id,
            username,
            commander_name,
            password_hash,
            achievements_json,
            created_at,
            updated_at,
          ] = params;
          this.accounts.set(String(id), {
            id: String(id),
            username: String(username),
            commander_name: String(commander_name),
            password_hash: String(password_hash),
            achievements_json: String(achievements_json ?? "[]"),
            created_at: Number(created_at),
            updated_at: Number(updated_at),
          });
          return { success: true, meta: { changes: 1 } };
        }
        if (
          normalized.startsWith(
            "UPDATE accounts SET commander_name = ?, updated_at = ? WHERE id = ?",
          )
        ) {
          const a = this.accounts.get(String(params[2]));
          if (a) {
            a.commander_name = String(params[0]);
            a.updated_at = Number(params[1]);
          }
          return { success: true, meta: { changes: a ? 1 : 0 } };
        }
        if (
          normalized.startsWith(
            "UPDATE accounts SET achievements_json = ?, updated_at = ? WHERE id = ?",
          )
        ) {
          const a = this.accounts.get(String(params[2]));
          if (a) {
            a.achievements_json = String(params[0]);
            a.updated_at = Number(params[1]);
          }
          return { success: true, meta: { changes: a ? 1 : 0 } };
        }
        if (normalized.startsWith("INSERT INTO sessions")) {
          const [token_hash, account_id, expires_at, created_at] = params;
          this.sessions.set(String(token_hash), {
            token_hash: String(token_hash),
            account_id: String(account_id),
            expires_at: Number(expires_at),
            created_at: Number(created_at),
          });
          return { success: true, meta: { changes: 1 } };
        }
        if (normalized.startsWith("DELETE FROM sessions WHERE token_hash = ?")) {
          const existed = this.sessions.delete(String(params[0]));
          return { success: true, meta: { changes: existed ? 1 : 0 } };
        }
        if (normalized.startsWith("INSERT INTO mp_games")) {
          const [
            id,
            public_type,
            creator_id,
            stage,
            listed,
            config_json,
            starts_at,
            auto_start_at,
            created_at,
            updated_at,
          ] = params;
          this.games.set(String(id), {
            id: String(id),
            public_type:
              public_type === null || public_type === undefined
                ? null
                : String(public_type),
            creator_id:
              creator_id === null || creator_id === undefined
                ? null
                : String(creator_id),
            stage: String(stage),
            listed: Number(listed ?? 0),
            config_json: String(config_json),
            starts_at:
              starts_at === null || starts_at === undefined
                ? null
                : Number(starts_at),
            auto_start_at:
              auto_start_at === null || auto_start_at === undefined
                ? null
                : Number(auto_start_at),
            started_at: null,
            game_start_info_json: null,
            successor_id: null,
            created_at: Number(created_at),
            updated_at: Number(updated_at),
          });
          return { success: true, meta: { changes: 1 } };
        }
        if (
          normalized.startsWith(
            "UPDATE mp_games SET stage = 'started', started_at = ?, game_start_info_json = ?, updated_at = ? WHERE id = ? AND stage = 'lobby'",
          )
        ) {
          const g = this.games.get(String(params[3]));
          if (!g || g.stage !== "lobby") {
            return { success: true, meta: { changes: 0 } };
          }
          g.stage = "started";
          g.started_at = Number(params[0]);
          g.game_start_info_json = String(params[1]);
          g.updated_at = Number(params[2]);
          return { success: true, meta: { changes: 1 } };
        }
        if (
          normalized.startsWith(
            "UPDATE mp_games SET config_json = ?, starts_at = ?, listed = ?, auto_start_at = ?, updated_at = ? WHERE id = ?",
          )
        ) {
          const g = this.games.get(String(params[5]));
          if (g) {
            g.config_json = String(params[0]);
            g.starts_at =
              params[1] === null || params[1] === undefined
                ? null
                : Number(params[1]);
            g.listed = Number(params[2] ?? 0);
            g.auto_start_at =
              params[3] === null || params[3] === undefined
                ? null
                : Number(params[3]);
            g.updated_at = Number(params[4]);
          }
          return { success: true, meta: { changes: g ? 1 : 0 } };
        }
        if (
          normalized.startsWith(
            "UPDATE mp_games SET successor_id = ?, updated_at = ? WHERE id = ?",
          )
        ) {
          const g = this.games.get(String(params[2]));
          if (g) {
            g.successor_id =
              params[0] === null || params[0] === undefined
                ? null
                : String(params[0]);
            g.updated_at = Number(params[1]);
          }
          return { success: true, meta: { changes: g ? 1 : 0 } };
        }
        if (
          normalized.startsWith(
            "UPDATE mp_games SET stage = 'finished', updated_at = ? WHERE id = ?",
          )
        ) {
          const g = this.games.get(String(params[1]));
          if (g) {
            g.stage = "finished";
            g.updated_at = Number(params[0]);
          }
          return { success: true, meta: { changes: g ? 1 : 0 } };
        }
        if (normalized.startsWith("DELETE FROM mp_games WHERE updated_at < ?")) {
          const cutoff = Number(params[0] ?? 0);
          let removed = 0;
          for (const [id, g] of this.games.entries()) {
            if (g.updated_at < cutoff) {
              this.games.delete(id);
              removed++;
            }
          }
          this.intents = this.intents.filter((i) => this.games.has(i.game_id));
          for (const [key, c] of this.clients.entries()) {
            if (!this.games.has(c.game_id)) this.clients.delete(key);
          }
          return { success: true, meta: { changes: removed } };
        }
        if (normalized.startsWith("INSERT OR REPLACE INTO mp_clients")) {
          const [
            game_id,
            persistent_id,
            client_id,
            username,
            clan_tag,
            cosmetics_json,
            spectator,
            kicked,
            joined_at,
            last_seen,
          ] = params;
          this.clients.set(`${game_id}::${persistent_id}`, {
            game_id: String(game_id),
            persistent_id: String(persistent_id),
            client_id: String(client_id),
            username: String(username),
            clan_tag:
              clan_tag === null || clan_tag === undefined
                ? null
                : String(clan_tag),
            cosmetics_json: String(cosmetics_json ?? "{}"),
            spectator: Number(spectator ?? 0),
            kicked: Number(kicked ?? 0),
            joined_at: Number(joined_at),
            last_seen: Number(last_seen),
          });
          return { success: true, meta: { changes: 1 } };
        }
        if (
          normalized.startsWith(
            "UPDATE mp_clients SET last_seen = ?, spectator = ? WHERE game_id = ? AND persistent_id = ?",
          )
        ) {
          const row = this.clients.get(`${params[2]}::${params[3]}`);
          if (row) {
            row.last_seen = Number(params[0]);
            row.spectator = Number(params[1]);
          }
          return { success: true, meta: { changes: row ? 1 : 0 } };
        }
        if (
          normalized.startsWith(
            "UPDATE mp_clients SET kicked = 1 WHERE game_id = ? AND client_id = ?",
          )
        ) {
          const gid = String(params[0]);
          const cid = String(params[1]);
          let changes = 0;
          for (const c of this.clients.values()) {
            if (c.game_id === gid && c.client_id === cid) {
              c.kicked = 1;
              changes++;
            }
          }
          return { success: true, meta: { changes } };
        }
        if (
          normalized.startsWith(
            "DELETE FROM mp_clients WHERE game_id = ? AND persistent_id = ?",
          )
        ) {
          const existed = this.clients.delete(`${params[0]}::${params[1]}`);
          return { success: true, meta: { changes: existed ? 1 : 0 } };
        }
        if (normalized.startsWith("INSERT INTO mp_intents")) {
          const [game_id, turn_number, intent_json] = params;
          this.intents.push({
            id: this.nextIntentId++,
            game_id: String(game_id),
            turn_number: Number(turn_number),
            intent_json: String(intent_json),
          });
          return { success: true, meta: { changes: 1 } };
        }
        if (
          normalized.startsWith("INSERT OR REPLACE INTO mp_matchmaking")
        ) {
          const [persistent_id, mode, assigned_game_id, queued_at, last_seen] =
            params;
          this.matchmaking.set(`${persistent_id}::${mode}`, {
            persistent_id: String(persistent_id),
            mode: String(mode),
            assigned_game_id:
              assigned_game_id === null || assigned_game_id === undefined
                ? null
                : String(assigned_game_id),
            queued_at: Number(queued_at),
            last_seen: Number(last_seen),
          });
          return { success: true, meta: { changes: 1 } };
        }
        if (
          normalized.startsWith(
            "UPDATE mp_matchmaking SET assigned_game_id = ? WHERE persistent_id = ? AND mode = ?",
          )
        ) {
          const row = this.matchmaking.get(`${params[1]}::${params[2]}`);
          if (row) {
            row.assigned_game_id =
              params[0] === null || params[0] === undefined
                ? null
                : String(params[0]);
          }
          return { success: true, meta: { changes: row ? 1 : 0 } };
        }
        if (
          normalized.startsWith(
            "DELETE FROM mp_matchmaking WHERE persistent_id = ? AND mode = ?",
          )
        ) {
          const existed = this.matchmaking.delete(`${params[0]}::${params[1]}`);
          return { success: true, meta: { changes: existed ? 1 : 0 } };
        }
        if (
          normalized.startsWith("DELETE FROM mp_matchmaking WHERE last_seen < ?")
        ) {
          const cutoff = Number(params[0] ?? 0);
          for (const [k, v] of this.matchmaking.entries()) {
            if (v.last_seen < cutoff) this.matchmaking.delete(k);
          }
          return { success: true, meta: { changes: 0 } };
        }
        return { success: true, meta: { changes: 0 } };
      },
    };
    return stmt;
  }
}

let fallbackInstance: MemoryCrownfallDb | null = null;

export async function getDb(env: CrownfallEnv): Promise<D1DatabaseLike> {
  if (env.DB) {
    await ensureSchema(env.DB);
    return env.DB;
  }
  fallbackInstance ??= new MemoryCrownfallDb();
  return fallbackInstance;
}
