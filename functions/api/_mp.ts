/**
 * Crownfall Multiplayer Engine for Cloudflare Pages Functions + Cloudflare D1.
 *
 * Implements:
 * - Auto-scheduled Public Lobbies (`ffa`, `team`, `special`) + Publicly Listed Hosted Lobbies (`hosted`)
 * - Private & Public Lobby Creation (`POST /api/create_game` & successor lobbies `?previous=`)
 * - Lobby Existence & Metadata (`GET /api/game/:id/exists`, `GET /api/game/:id`)
 * - Host Controls (`update_game_config`, `kick_player`, `toggle_game_start_timer`, `listing`)
 * - Deterministic Lockstep Turn & Intent Relay (`POST /api/mp/sync`)
 * - Ranked 1v1 & 2v2 Matchmaking (`POST /api/mp/matchmaking`)
 */

import { jsonResponse } from "./_auth";
import { type D1DatabaseLike, getDb, type PagesContext } from "./_db";

const ID_ALPHABET =
  "123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const CLIENT_ACTIVE_TTL_MS = 20_000;
const GAME_STALE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const PUBLIC_LOBBY_COUNTDOWN_MS = 45_000; // 45s countdown once players join (or 60s rolling)
const PUBLIC_LOBBY_IDLE_ROTATE_MS = 90_000;
const TURN_INTERVAL_MS = 100;
const LOCKSTEP_HORIZON_TURNS = 3; // +300ms lockstep horizon so no peer ever misses an intent

const ROTATION_MAPS = [
  "World",
  "Europe",
  "Asia",
  "Mena",
  "North America",
  "Africa",
  "Black Sea",
  "South America",
  "Britannia",
  "Caribbean",
  "Australia",
];

function randomId(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  }
  return out;
}

function generateGameId(): string {
  return `a${randomId(9)}`;
}

function generateClientId(): string {
  return randomId(8);
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function sanitizeDisplayName(raw: unknown): string {
  if (typeof raw !== "string") return "Commander";
  const cleaned = raw.trim().slice(0, 27);
  return cleaned.length > 0 ? cleaned : "Commander";
}

function defaultPrivateConfig(): Record<string, unknown> {
  return {
    gameMap: "World",
    gameMapSize: "Normal",
    gameType: "Private",
    difficulty: "Medium",
    infiniteGold: false,
    donateGold: false,
    infiniteTroops: false,
    donateTroops: false,
    maxTimerValue: undefined,
    instantBuild: false,
    randomSpawn: false,
    gameMode: "Free For All",
    playerTeams: 2,
    bots: 400,
    nations: "default",
    disabledUnits: [],
  };
}

function buildPublicConfig(
  publicType: "ffa" | "team" | "special",
  slotSeed: number,
): Record<string, unknown> {
  const map = ROTATION_MAPS[Math.abs(slotSeed) % ROTATION_MAPS.length];
  if (publicType === "team") {
    const teamOptions = [2, 3, 4, "Duos", "Trios", "Quads"];
    const teams = teamOptions[Math.abs(slotSeed >> 1) % teamOptions.length];
    return {
      gameMap: map,
      gameMapSize: "Normal",
      gameType: "Public",
      difficulty: "Medium",
      infiniteGold: false,
      donateGold: true,
      infiniteTroops: false,
      donateTroops: true,
      instantBuild: false,
      randomSpawn: false,
      gameMode: "Team",
      playerTeams: teams,
      bots: 400,
      nations: "default",
      maxPlayers: 60,
      disabledUnits: [],
    };
  }
  if (publicType === "special") {
    const variant = Math.abs(slotSeed) % 3;
    return {
      gameMap: map,
      gameMapSize: variant === 0 ? "Compact" : "Normal",
      gameType: "Public",
      difficulty: variant === 1 ? "Hard" : "Medium",
      infiniteGold: false,
      donateGold: false,
      infiniteTroops: false,
      donateTroops: false,
      instantBuild: false,
      randomSpawn: variant === 2,
      gameMode: "Free For All",
      bots: variant === 0 ? 200 : 400,
      nations: "default",
      maxPlayers: 50,
      goldMultiplier: variant === 0 ? 2 : undefined,
      doomsdayClock:
        variant === 1 ? { enabled: true, speed: "normal" } : undefined,
      publicGameModifiers: {
        isCompact: variant === 0 || undefined,
        goldMultiplier: variant === 0 ? 2 : undefined,
        isHardNations: variant === 1 || undefined,
        isDoomsdayClock: variant === 1 || undefined,
        isRandomSpawn: variant === 2 || undefined,
      },
      disabledUnits: [],
    };
  }
  return {
    gameMap: map,
    gameMapSize: "Normal",
    gameType: "Public",
    difficulty: "Medium",
    infiniteGold: false,
    donateGold: false,
    infiniteTroops: false,
    donateTroops: false,
    instantBuild: false,
    randomSpawn: false,
    gameMode: "Free For All",
    bots: 400,
    nations: "default",
    maxPlayers: 60,
    disabledUnits: [],
  };
}

const COPIED_PATCH_KEYS = [
  "gameMap",
  "gameMapSize",
  "difficulty",
  "nations",
  "bots",
  "infiniteGold",
  "donateGold",
  "infiniteTroops",
  "donateTroops",
  "instantBuild",
  "randomSpawn",
  "gameMode",
  "disabledUnits",
  "playerTeams",
  "allowedPublicIds",
  "trusted",
  "doomsdayClock",
  "overtime",
  "stableHegemony",
  "anonymizeNames",
  "nameReveals",
  "nameRevealPublicIds",
];

const NULLABLE_PATCH_KEYS = [
  "maxTimerValue",
  "winThresholdTenths",
  "startDelay",
  "spawnImmunityDuration",
  "goldMultiplier",
  "startingGold",
  "disableAlliances",
  "disablePaths",
  "disableAugments",
  "disableRebellions",
  "customAllianceDuration",
  "waterNukes",
];

function applyConfigPatch(
  target: Record<string, unknown>,
  patch: Record<string, unknown>,
): void {
  for (const key of COPIED_PATCH_KEYS) {
    if (patch[key] !== undefined) {
      target[key] = patch[key];
    }
  }
  for (const key of NULLABLE_PATCH_KEYS) {
    if (patch[key] !== undefined) {
      if (patch[key] === null) {
        delete target[key];
      } else {
        target[key] = patch[key];
      }
    }
  }
  if (patch.maxPlayers !== undefined) {
    if (patch.maxPlayers === null) {
      delete target.maxPlayers;
    } else {
      target.maxPlayers = patch.maxPlayers;
    }
  }
  target.hostCheats = patch.hostCheats;
}

function sanitizeConfigForWire(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const copy = { ...config };
  delete copy.pool;
  delete copy.allowedPublicIds;
  delete copy.nameRevealPublicIds;
  return copy;
}

interface DbGameRow {
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

interface DbClientRow {
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

async function getActiveClients(
  db: D1DatabaseLike,
  gameId: string,
  now: number,
): Promise<DbClientRow[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM mp_clients WHERE game_id = ? AND kicked = 0 AND last_seen >= ? ORDER BY joined_at ASC",
    )
    .bind(gameId, now - CLIENT_ACTIVE_TTL_MS)
    .all<DbClientRow>();
  return results;
}

async function maybeTransitionGameToStarted(
  db: D1DatabaseLike,
  game: DbGameRow,
  now: number,
): Promise<DbGameRow> {
  if (game.stage !== "lobby") return game;
  const deadline = game.starts_at ?? game.auto_start_at;
  if (deadline === null || now < deadline) return game;

  const activeClients = await getActiveClients(db, game.id, now);
  const seatedPlayers = activeClients.filter((c) => c.spectator === 0);

  // If a scheduled public lobby expired with 0 human players, rotate its timer forward
  if (seatedPlayers.length === 0) {
    if (game.public_type) {
      const nextStartsAt = now + PUBLIC_LOBBY_IDLE_ROTATE_MS;
      const nextConfig = buildPublicConfig(
        game.public_type as "ffa" | "team" | "special",
        Math.floor(now / 10000),
      );
      await db
        .prepare(
          "UPDATE mp_games SET config_json = ?, starts_at = ?, listed = ?, auto_start_at = ?, updated_at = ? WHERE id = ?",
        )
        .bind(
          JSON.stringify(nextConfig),
          nextStartsAt,
          game.listed,
          game.auto_start_at,
          now,
          game.id,
        )
        .run();
      return {
        ...game,
        config_json: JSON.stringify(nextConfig),
        starts_at: nextStartsAt,
        updated_at: now,
      };
    }
    return game;
  }

  const rawConfig = JSON.parse(game.config_json) as Record<string, unknown>;
  const players = seatedPlayers.map((c) => {
    let cosmetics: Record<string, unknown> = {};
    try {
      cosmetics = JSON.parse(c.cosmetics_json || "{}") as Record<
        string,
        unknown
      >;
    } catch {
      cosmetics = {};
    }
    return {
      clientID: c.client_id,
      username: c.username,
      clanTag: c.clan_tag ?? null,
      cosmetics,
    };
  });

  const hostClient = game.creator_id
    ? seatedPlayers.find((c) => c.persistent_id === game.creator_id)
    : undefined;

  const wireStartInfo = {
    gameID: game.id,
    lobbyCreatedAt: game.created_at,
    config: sanitizeConfigForWire(rawConfig),
    players,
    ...(game.listed === 1 ? { listed: true } : {}),
    ...(hostClient ? { hostClientID: hostClient.client_id } : {}),
  };

  const startInfoJson = JSON.stringify(wireStartInfo);
  await db
    .prepare(
      "UPDATE mp_games SET stage = 'started', started_at = ?, game_start_info_json = ?, updated_at = ? WHERE id = ? AND stage = 'lobby'",
    )
    .bind(now, startInfoJson, now, game.id)
    .run();

  const updated = await db
    .prepare("SELECT * FROM mp_games WHERE id = ?")
    .bind(game.id)
    .first<DbGameRow>();
  return updated ?? {
    ...game,
    stage: "started",
    started_at: now,
    game_start_info_json: startInfoJson,
    updated_at: now,
  };
}

function buildLobbyGameInfo(
  game: DbGameRow,
  clients: DbClientRow[],
  now: number,
): Record<string, unknown> {
  const rawConfig = JSON.parse(game.config_json) as Record<string, unknown>;
  const creatorClient = game.creator_id
    ? clients.find((c) => c.persistent_id === game.creator_id)
    : undefined;
  const seatedCount = clients.filter((c) => c.spectator === 0).length;

  return {
    gameID: game.id,
    clients: clients.map((c) => {
      let cosmetics: Record<string, unknown> = {};
      try {
        cosmetics = JSON.parse(c.cosmetics_json || "{}") as Record<
          string,
          unknown
        >;
      } catch {
        cosmetics = {};
      }
      return {
        clientID: c.client_id,
        username: c.username,
        clanTag: c.clan_tag ?? null,
        cosmetics,
        ...(c.spectator === 1 ? { spectator: true } : {}),
      };
    }),
    numClients: seatedCount,
    gameConfig: sanitizeConfigForWire(rawConfig),
    ...(game.starts_at !== null ? { startsAt: game.starts_at } : {}),
    ...(game.auto_start_at !== null ? { autoStartAt: game.auto_start_at } : {}),
    ...(game.public_type ? { publicGameType: game.public_type } : {}),
    ...(game.listed === 1 ? { listed: true } : { listed: false }),
    ...(creatorClient ? { lobbyCreatorClientID: creatorClient.client_id } : {}),
    serverTime: now,
  };
}

async function ensureScheduledPublicLobbies(
  db: D1DatabaseLike,
  now: number,
): Promise<DbGameRow[]> {
  // Periodic housekeeping of very old games
  if (Math.random() < 0.05) {
    await db
      .prepare("DELETE FROM mp_games WHERE updated_at < ?")
      .bind(now - GAME_STALE_TTL_MS)
      .run();
  }

  const { results: currentLobbies } = await db
    .prepare("SELECT * FROM mp_games WHERE stage = 'lobby'")
    .all<DbGameRow>();

  const checked: DbGameRow[] = [];
  for (const g of currentLobbies) {
    const next = await maybeTransitionGameToStarted(db, g, now);
    if (next.stage === "lobby") {
      checked.push(next);
    }
  }

  const requiredTypes: Array<"ffa" | "team" | "special"> = [
    "ffa",
    "team",
    "special",
  ];
  for (let idx = 0; idx < requiredTypes.length; idx++) {
    const type = requiredTypes[idx];
    const hasOpen = checked.some((g) => g.public_type === type);
    if (!hasOpen) {
      const id = generateGameId();
      const cfg = buildPublicConfig(type, Math.floor(now / 15000) + idx * 7);
      const startsAt = now + PUBLIC_LOBBY_COUNTDOWN_MS + idx * 5_000;
      await db
        .prepare(
          "INSERT INTO mp_games (id, public_type, creator_id, stage, listed, config_json, starts_at, auto_start_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          id,
          type,
          null,
          "lobby",
          0,
          JSON.stringify(cfg),
          startsAt,
          null,
          now,
          now,
        )
        .run();
      checked.push({
        id,
        public_type: type,
        creator_id: null,
        stage: "lobby",
        listed: 0,
        config_json: JSON.stringify(cfg),
        starts_at: startsAt,
        auto_start_at: null,
        started_at: null,
        game_start_info_json: null,
        successor_id: null,
        created_at: now,
        updated_at: now,
      });
    }
  }

  return checked;
}

export async function handleGetLobbies(
  context: PagesContext,
): Promise<Response> {
  const db = await getDb(context.env);
  const now = Date.now();
  const lobbies = await ensureScheduledPublicLobbies(db, now);

  const { results: countRows } = await db
    .prepare(
      "SELECT game_id, COUNT(*) as cnt FROM mp_clients WHERE kicked = 0 AND spectator = 0 AND last_seen >= ? GROUP BY game_id",
    )
    .bind(now - CLIENT_ACTIVE_TTL_MS)
    .all<{ game_id: string; cnt: number }>();

  const countMap = new Map<string, number>();
  for (const r of countRows) {
    countMap.set(r.game_id, Number(r.cnt));
  }

  const games: Record<string, Array<Record<string, unknown>>> = {
    ffa: [],
    team: [],
    special: [],
    hosted: [],
  };

  for (const g of lobbies) {
    const bucket =
      g.public_type === "ffa" ||
      g.public_type === "team" ||
      g.public_type === "special"
        ? g.public_type
        : g.listed === 1
          ? "hosted"
          : null;
    if (!bucket) continue;
    const rawConfig = JSON.parse(g.config_json) as Record<string, unknown>;
    games[bucket].push({
      gameID: g.id,
      numClients: countMap.get(g.id) ?? 0,
      gameConfig: sanitizeConfigForWire(rawConfig),
      ...(g.starts_at !== null ? { startsAt: g.starts_at } : {}),
      ...(g.auto_start_at !== null ? { autoStartAt: g.auto_start_at } : {}),
      publicGameType: bucket,
      ...(bucket === "hosted" ? { custom: true } : {}),
    });
  }

  return jsonResponse({
    serverTime: now,
    active: true,
    games,
  });
}

export async function handleCreateGame(
  context: PagesContext,
): Promise<Response> {
  const db = await getDb(context.env);
  const now = Date.now();
  const creatorId =
    extractBearerToken(context.request) ?? `guest_${randomId(12)}`;

  const url = new URL(context.request.url);
  const previousId = url.searchParams.get("previous");
  if (previousId) {
    const prev = await db
      .prepare("SELECT * FROM mp_games WHERE id = ?")
      .bind(previousId)
      .first<DbGameRow>();
    if (!prev) {
      return jsonResponse({ error: "Previous game not found" }, 404);
    }
    if (prev.creator_id && prev.creator_id !== creatorId) {
      return jsonResponse(
        { error: "Only the lobby creator can create a successor lobby" },
        403,
      );
    }
    if (prev.successor_id) {
      const existing = await db
        .prepare("SELECT * FROM mp_games WHERE id = ?")
        .bind(prev.successor_id)
        .first<DbGameRow>();
      if (existing) {
        const clients = await getActiveClients(db, existing.id, now);
        return jsonResponse({
          ...buildLobbyGameInfo(existing, clients, now),
          workerIndex: 0,
          workerPath: "w0",
        });
      }
    }
  }

  let bodyConfig: Record<string, unknown> = {};
  try {
    const parsed = (await context.request.json()) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      bodyConfig = parsed as Record<string, unknown>;
    }
  } catch {
    // Empty body defaults to private game config
  }

  const cfg = { ...defaultPrivateConfig(), ...bodyConfig, gameType: "Private" };
  const id = generateGameId();

  await db
    .prepare(
      "INSERT INTO mp_games (id, public_type, creator_id, stage, listed, config_json, starts_at, auto_start_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      null,
      creatorId,
      "lobby",
      0,
      JSON.stringify(cfg),
      null,
      null,
      now,
      now,
    )
    .run();

  if (previousId) {
    await db
      .prepare("UPDATE mp_games SET successor_id = ?, updated_at = ? WHERE id = ?")
      .bind(id, now, previousId)
      .run();
  }

  return jsonResponse({
    gameID: id,
    clients: [],
    numClients: 0,
    gameConfig: sanitizeConfigForWire(cfg),
    workerIndex: 0,
    workerPath: "w0",
  });
}

export async function handleGameExists(
  context: PagesContext,
  gameId: string,
): Promise<Response> {
  const db = await getDb(context.env);
  const game = await db
    .prepare("SELECT * FROM mp_games WHERE id = ?")
    .bind(gameId)
    .first<DbGameRow>();
  return jsonResponse({
    exists: game !== null && game.stage !== "finished",
  });
}

export async function handleGetGame(
  context: PagesContext,
  gameId: string,
): Promise<Response> {
  const db = await getDb(context.env);
  const now = Date.now();
  const game = await db
    .prepare("SELECT * FROM mp_games WHERE id = ?")
    .bind(gameId)
    .first<DbGameRow>();
  if (!game) {
    return jsonResponse({ error: "Game not found" }, 404);
  }
  const clients = await getActiveClients(db, game.id, now);
  return jsonResponse(buildLobbyGameInfo(game, clients, now));
}

export async function handleListing(
  context: PagesContext,
  gameId: string,
): Promise<Response> {
  const db = await getDb(context.env);
  const now = Date.now();
  const token = extractBearerToken(context.request);
  if (!token) {
    return jsonResponse({ error: "Authorization header required" }, 400);
  }

  const game = await db
    .prepare("SELECT * FROM mp_games WHERE id = ?")
    .bind(gameId)
    .first<DbGameRow>();
  if (!game) {
    return jsonResponse({ error: "Game not found" }, 404);
  }
  if (game.creator_id && game.creator_id !== token) {
    return jsonResponse(
      { error: "Only the lobby creator can change its listing" },
      403,
    );
  }
  if (game.stage !== "lobby") {
    return jsonResponse({ error: "Game cannot be listed" }, 409);
  }

  let body: {
    listed?: boolean;
    autoStartMs?: number;
    maxPlayers?: number;
  } = {};
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const listed = body.listed === true ? 1 : 0;
  const cfg = JSON.parse(game.config_json) as Record<string, unknown>;
  if (listed === 1 && typeof body.maxPlayers === "number") {
    cfg.maxPlayers = Math.max(2, Math.min(100, Math.floor(body.maxPlayers)));
  }
  const autoStartAt =
    listed === 1
      ? now +
        Math.max(
          30_000,
          Math.min(15 * 60_000, Number(body.autoStartMs ?? 5 * 60_000)),
        )
      : null;

  await db
    .prepare(
      "UPDATE mp_games SET config_json = ?, starts_at = ?, listed = ?, auto_start_at = ?, updated_at = ? WHERE id = ?",
    )
    .bind(
      JSON.stringify(cfg),
      game.starts_at,
      listed,
      autoStartAt,
      now,
      game.id,
    )
    .run();

  return jsonResponse({ listed: listed === 1 });
}

interface SyncRequestBody {
  action?: "join" | "rejoin" | "sync" | "leave";
  gameID?: string;
  token?: string;
  username?: string;
  clanTag?: string | null;
  cosmetics?: Record<string, unknown>;
  spectator?: boolean;
  sinceTurn?: number;
  intents?: Array<Record<string, unknown>>;
  winner?: unknown;
}

export async function handleSync(context: PagesContext): Promise<Response> {
  const db = await getDb(context.env);
  const now = Date.now();

  let body: SyncRequestBody;
  try {
    body = (await context.request.json()) as SyncRequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const gameId = typeof body.gameID === "string" ? body.gameID.trim() : "";
  if (!gameId) {
    return jsonResponse({ error: "Missing gameID" }, 400);
  }

  const persistentId =
    (typeof body.token === "string" && body.token.trim().length > 0
      ? body.token.trim()
      : extractBearerToken(context.request)) ?? `guest_${randomId(12)}`;

  if (body.action === "leave") {
    await db
      .prepare(
        "DELETE FROM mp_clients WHERE game_id = ? AND persistent_id = ?",
      )
      .bind(gameId, persistentId)
      .run();
    return jsonResponse({ ok: true });
  }

  let game = await db
    .prepare("SELECT * FROM mp_games WHERE id = ?")
    .bind(gameId)
    .first<DbGameRow>();
  if (!game) {
    return jsonResponse({ error: "game_not_found" }, 404);
  }

  // Upsert or refresh client record
  let clientRow = await db
    .prepare(
      "SELECT * FROM mp_clients WHERE game_id = ? AND persistent_id = ?",
    )
    .bind(gameId, persistentId)
    .first<DbClientRow>();

  if (clientRow?.kicked === 1) {
    return jsonResponse({ error: "kicked" }, 403);
  }

  if (body.action === "join" || !clientRow) {
    const rawConfig = JSON.parse(game.config_json) as Record<string, unknown>;
    const maxPlayers =
      typeof rawConfig.maxPlayers === "number" ? rawConfig.maxPlayers : 0;
    const activeClients = await getActiveClients(db, gameId, now);
    const seatedCount = activeClients.filter(
      (c) => c.spectator === 0 && c.persistent_id !== persistentId,
    ).length;

    let spectator = body.spectator === true ? 1 : 0;
    if (game.stage === "started" && !clientRow) {
      // Late joiners enter as spectators unless already seated in gameStartInfo
      spectator = 1;
    } else if (
      spectator === 0 &&
      maxPlayers > 0 &&
      seatedCount >= maxPlayers &&
      !clientRow
    ) {
      return jsonResponse({ error: "full-lobby" }, 409);
    }

    const assignedClientId = clientRow?.client_id ?? generateClientId();
    const username = sanitizeDisplayName(
      body.username ?? clientRow?.username ?? "Commander",
    );
    const clanTag =
      body.clanTag !== undefined
        ? body.clanTag
        : (clientRow?.clan_tag ?? null);
    const cosmeticsJson = body.cosmetics
      ? JSON.stringify(body.cosmetics)
      : (clientRow?.cosmetics_json ?? "{}");
    const joinedAt = clientRow?.joined_at ?? now;

    await db
      .prepare(
        "INSERT OR REPLACE INTO mp_clients (game_id, persistent_id, client_id, username, clan_tag, cosmetics_json, spectator, kicked, joined_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        gameId,
        persistentId,
        assignedClientId,
        username,
        clanTag,
        cosmeticsJson,
        spectator,
        0,
        joinedAt,
        now,
      )
      .run();

    clientRow = {
      game_id: gameId,
      persistent_id: persistentId,
      client_id: assignedClientId,
      username,
      clan_tag: clanTag,
      cosmetics_json: cosmeticsJson,
      spectator,
      kicked: 0,
      joined_at: joinedAt,
      last_seen: now,
    };

    // If a scheduled public lobby now has players and a long idle timer, tighten countdown to 20s for snappy matches
    if (
      game.stage === "lobby" &&
      game.public_type &&
      spectator === 0 &&
      (game.starts_at === null || game.starts_at - now > 25_000)
    ) {
      const quickStart = now + 20_000;
      await db
        .prepare(
          "UPDATE mp_games SET config_json = ?, starts_at = ?, listed = ?, auto_start_at = ?, updated_at = ? WHERE id = ?",
        )
        .bind(
          game.config_json,
          quickStart,
          game.listed,
          game.auto_start_at,
          now,
          game.id,
        )
        .run();
      game.starts_at = quickStart;
    }
  } else {
    const nextSpectator =
      typeof body.spectator === "boolean"
        ? body.spectator
          ? 1
          : 0
        : clientRow.spectator;
    await db
      .prepare(
        "UPDATE mp_clients SET last_seen = ?, spectator = ? WHERE game_id = ? AND persistent_id = ?",
      )
      .bind(now, nextSpectator, gameId, persistentId)
      .run();
    clientRow.last_seen = now;
    clientRow.spectator = nextSpectator;
  }

  const isCreator =
    game.creator_id !== null && game.creator_id === persistentId;

  // Process incoming intents
  const incomingIntents = Array.isArray(body.intents) ? body.intents : [];
  if (incomingIntents.length > 0) {
    if (game.stage === "lobby") {
      const cfg = JSON.parse(game.config_json) as Record<string, unknown>;
      let startsAt = game.starts_at;
      let changed = false;

      for (const intent of incomingIntents) {
        if (!isCreator) continue;
        const type = intent.type;
        if (type === "update_game_config" && game.listed === 0) {
          if (typeof intent.config === "object" && intent.config !== null) {
            applyConfigPatch(cfg, intent.config as Record<string, unknown>);
            changed = true;
          }
        } else if (type === "toggle_game_start_timer") {
          if (startsAt !== null) {
            startsAt = null;
          } else {
            const delaySec =
              typeof cfg.startDelay === "number" ? cfg.startDelay : 3;
            startsAt = now + Math.max(0, delaySec) * 1000;
          }
          changed = true;
        } else if (
          type === "kick_player" &&
          typeof intent.targetClientID === "string"
        ) {
          if (intent.targetClientID !== clientRow.client_id) {
            await db
              .prepare(
                "UPDATE mp_clients SET kicked = 1 WHERE game_id = ? AND client_id = ?",
              )
              .bind(gameId, intent.targetClientID)
              .run();
          }
        }
      }

      if (changed) {
        await db
          .prepare(
            "UPDATE mp_games SET config_json = ?, starts_at = ?, listed = ?, auto_start_at = ?, updated_at = ? WHERE id = ?",
          )
          .bind(
            JSON.stringify(cfg),
            startsAt,
            game.listed,
            game.auto_start_at,
            now,
            game.id,
          )
          .run();
        game.config_json = JSON.stringify(cfg);
        game.starts_at = startsAt;
      }
    } else if (game.stage === "started" && clientRow.spectator === 0) {
      const startedAt = game.started_at ?? now;
      const currentTurn = Math.max(
        0,
        Math.floor((now - startedAt) / TURN_INTERVAL_MS),
      );
      const targetTurn = currentTurn + LOCKSTEP_HORIZON_TURNS;

      for (const intent of incomingIntents) {
        const type = intent.type;
        if (
          type === "update_game_config" ||
          type === "toggle_game_start_timer" ||
          type === "kick_player"
        ) {
          continue;
        }
        const stamped = {
          ...intent,
          clientID: clientRow.client_id,
        };
        await db
          .prepare(
            "INSERT INTO mp_intents (game_id, turn_number, intent_json) VALUES (?, ?, ?)",
          )
          .bind(gameId, targetTurn, JSON.stringify(stamped))
          .run();
      }
    }
  }

  if (body.winner !== undefined && game.stage === "started") {
    // Keep game joinable for successor lobbies, mark updated_at
    game.updated_at = now;
  }

  // Check if lobby timer reached 0 -> transition to started!
  game = await maybeTransitionGameToStarted(db, game, now);

  if (game.stage === "lobby") {
    const clients = await getActiveClients(db, game.id, now);
    return jsonResponse({
      stage: "lobby",
      serverTime: now,
      myClientID: clientRow.client_id,
      lobby: buildLobbyGameInfo(game, clients, now),
    });
  }

  // Active or finished game: return gameStartInfo (when requested / joining) + lockstep turns up to safeTurn
  const startedAt = game.started_at ?? now;
  const safeTurn = Math.max(
    0,
    Math.floor((now - startedAt) / TURN_INTERVAL_MS),
  );
  const sinceTurn =
    typeof body.sinceTurn === "number" && body.sinceTurn >= 0
      ? Math.floor(body.sinceTurn)
      : 0;

  const { results: intentRows } =
    safeTurn >= sinceTurn
      ? await db
          .prepare(
            "SELECT turn_number, intent_json FROM mp_intents WHERE game_id = ? AND turn_number >= ? AND turn_number <= ? ORDER BY turn_number ASC, id ASC",
          )
          .bind(gameId, sinceTurn, safeTurn)
          .all<{ turn_number: number; intent_json: string }>()
      : { results: [] };

  const intentsByTurn: Record<number, unknown[]> = {};
  for (const row of intentRows) {
    try {
      const list = (intentsByTurn[row.turn_number] ??= []);
      list.push(JSON.parse(row.intent_json));
    } catch {
      // Ignore malformed intent row
    }
  }

  const includeStartInfo =
    body.action === "join" || body.action === "rejoin" || sinceTurn === 0;
  const gameStartInfo =
    includeStartInfo && game.game_start_info_json
      ? (JSON.parse(game.game_start_info_json) as Record<string, unknown>)
      : undefined;

  return jsonResponse({
    stage: game.stage,
    serverTime: now,
    myClientID: clientRow.client_id,
    lobbyCreatedAt: game.created_at,
    ...(gameStartInfo ? { gameStartInfo } : {}),
    sinceTurn,
    safeTurn,
    intentsByTurn,
    ...(game.successor_id ? { successorId: game.successor_id } : {}),
  });
}

export async function handleMatchmaking(
  context: PagesContext,
): Promise<Response> {
  const db = await getDb(context.env);
  const now = Date.now();

  let body: {
    action?: "poll" | "leave";
    mode?: string;
    token?: string;
  } = {};
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const mode = body.mode === "2v2" ? "2v2" : "1v1";
  const persistentId =
    (typeof body.token === "string" && body.token.trim().length > 0
      ? body.token.trim()
      : extractBearerToken(context.request)) ?? `guest_${randomId(12)}`;

  if (body.action === "leave") {
    await db
      .prepare(
        "DELETE FROM mp_matchmaking WHERE persistent_id = ? AND mode = ?",
      )
      .bind(persistentId, mode)
      .run();
    return jsonResponse({ ok: true });
  }

  await db
    .prepare("DELETE FROM mp_matchmaking WHERE last_seen < ?")
    .bind(now - 15_000)
    .run();

  const existing = await db
    .prepare(
      "SELECT * FROM mp_matchmaking WHERE persistent_id = ? AND mode = ?",
    )
    .bind(persistentId, mode)
    .first<{
      persistent_id: string;
      mode: string;
      assigned_game_id: string | null;
      queued_at: number;
      last_seen: number;
    }>();

  if (existing?.assigned_game_id) {
    await db
      .prepare(
        "DELETE FROM mp_matchmaking WHERE persistent_id = ? AND mode = ?",
      )
      .bind(persistentId, mode)
      .run();
    return jsonResponse({
      type: "match-assignment",
      gameId: existing.assigned_game_id,
    });
  }

  const queuedAt = existing?.queued_at ?? now;
  await db
    .prepare(
      "INSERT OR REPLACE INTO mp_matchmaking (persistent_id, mode, assigned_game_id, queued_at, last_seen) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(persistentId, mode, null, queuedAt, now)
    .run();

  const needed = mode === "2v2" ? 4 : 2;
  const { results: waiting } = await db
    .prepare(
      "SELECT * FROM mp_matchmaking WHERE mode = ? AND last_seen >= ? ORDER BY queued_at ASC",
    )
    .bind(mode, now - 15_000)
    .all<{
      persistent_id: string;
      mode: string;
      assigned_game_id: string | null;
      queued_at: number;
    }>();

  const unmatched = waiting.filter((w) => !w.assigned_game_id);
  if (unmatched.length >= needed) {
    const matchedGroup = unmatched.slice(0, needed);
    const gameId = generateGameId();
    const map = ROTATION_MAPS[Math.floor(now / 5000) % ROTATION_MAPS.length];
    const cfg = {
      gameMap: map,
      gameMapSize: mode === "1v1" ? "Compact" : "Normal",
      gameType: "Public",
      difficulty: "Medium",
      infiniteGold: false,
      donateGold: mode === "2v2",
      infiniteTroops: false,
      donateTroops: mode === "2v2",
      instantBuild: false,
      randomSpawn: false,
      gameMode: mode === "2v2" ? "Team" : "Free For All",
      playerTeams: mode === "2v2" ? 2 : undefined,
      bots: mode === "1v1" ? 150 : 300,
      nations: "default",
      maxPlayers: needed,
      rankedType: mode,
      disabledUnits: [],
    };
    const startsAt = now + 8_000;
    await db
      .prepare(
        "INSERT INTO mp_games (id, public_type, creator_id, stage, listed, config_json, starts_at, auto_start_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        gameId,
        null,
        null,
        "lobby",
        0,
        JSON.stringify(cfg),
        startsAt,
        null,
        now,
        now,
      )
      .run();

    for (const entry of matchedGroup) {
      if (entry.persistent_id === persistentId) {
        await db
          .prepare(
            "DELETE FROM mp_matchmaking WHERE persistent_id = ? AND mode = ?",
          )
          .bind(persistentId, mode)
          .run();
      } else {
        await db
          .prepare(
            "UPDATE mp_matchmaking SET assigned_game_id = ? WHERE persistent_id = ? AND mode = ?",
          )
          .bind(gameId, entry.persistent_id, mode)
          .run();
      }
    }

    if (matchedGroup.some((m) => m.persistent_id === persistentId)) {
      return jsonResponse({
        type: "match-assignment",
        gameId,
      });
    }
  }

  return jsonResponse({
    type: "queue-size",
    count: unmatched.length,
  });
}

export async function handleWorkerSubroute(
  context: PagesContext,
  subpath: string,
): Promise<Response> {
  const method = context.request.method.toUpperCase();

  if (method === "POST" && subpath === "api/create_game") {
    return handleCreateGame(context);
  }

  const singleplayerMatch = /^api\/singleplayer\/[^/]+\/heartbeat$/.exec(
    subpath,
  );
  if (method === "POST" && singleplayerMatch) {
    return new Response(null, { status: 204 });
  }

  const existsMatch = /^api\/game\/([A-Za-z0-9_-]+)\/exists$/.exec(subpath);
  if (method === "GET" && existsMatch) {
    return handleGameExists(context, existsMatch[1]);
  }

  const listingMatch = /^api\/game\/([A-Za-z0-9_-]+)\/listing$/.exec(subpath);
  if (method === "POST" && listingMatch) {
    return handleListing(context, listingMatch[1]);
  }

  const gameMatch = /^api\/game\/([A-Za-z0-9_-]+)$/.exec(subpath);
  if (method === "GET" && gameMatch) {
    return handleGetGame(context, gameMatch[1]);
  }

  // Browser navigation to `/w0/game/<id>?lobby` or `/w1/game/<id>` -> serve SPA index.html!
  if (method === "GET" && context.env.ASSETS) {
    const indexUrl = new URL("/index.html", context.request.url);
    return context.env.ASSETS.fetch(new Request(indexUrl.toString()));
  }

  return jsonResponse({ error: "Not found" }, 404);
}
