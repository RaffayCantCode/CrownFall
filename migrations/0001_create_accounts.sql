-- Crownfall Unified Schema for Cloudflare D1 (Accounts, Achievements & Multiplayer)
-- Apply via Cloudflare Dashboard (D1 -> Console) or CLI:
--   npx wrangler d1 execute crownfall-db --remote --file=migrations/0001_create_accounts.sql
-- (Note: Crownfall Pages Functions also auto-initialize these tables on first request.)

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  commander_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  achievements_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_account_id ON sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS mp_games (
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
);

CREATE INDEX IF NOT EXISTS idx_mp_games_stage ON mp_games(stage, updated_at);

CREATE TABLE IF NOT EXISTS mp_clients (
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
);

CREATE INDEX IF NOT EXISTS idx_mp_clients_game ON mp_clients(game_id, last_seen);

CREATE TABLE IF NOT EXISTS mp_intents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  intent_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mp_intents_game_turn ON mp_intents(game_id, turn_number, id);

CREATE TABLE IF NOT EXISTS mp_matchmaking (
  persistent_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  assigned_game_id TEXT,
  queued_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (persistent_id, mode)
);

CREATE INDEX IF NOT EXISTS idx_mp_matchmaking_mode ON mp_matchmaking(mode, last_seen);
