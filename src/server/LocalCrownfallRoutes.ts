import { GameEnv } from "@openfront/shared/configuration/Env";
import crypto from "crypto";
import type { Express, Request, Response } from "express";
import fs from "fs";
import http from "http";
import path from "path";
import { ServerEnv } from "./ServerEnv";

interface StoredAccount {
  id: string;
  username: string;
  commanderName: string;
  passwordHash: string;
  achievements: Array<{ mapName: string; difficulty: string }>;
  createdAt: number;
  updatedAt: number;
}

interface StoredSession {
  tokenHash: string;
  accountId: string;
  expiresAt: number;
  createdAt: number;
}

interface LocalStoreData {
  accounts: StoredAccount[];
  sessions: StoredSession[];
}

const SESSION_COOKIE_NAME = "crownfall_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PBKDF2_ITERATIONS = 100_000;
const STORE_PATH = path.resolve(
  process.cwd(),
  ".local-data",
  "crownfall-accounts.json",
);

function loadStore(): LocalStoreData {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      return { accounts: [], sessions: [] };
    }
    const parsed = JSON.parse(
      fs.readFileSync(STORE_PATH, "utf-8"),
    ) as Partial<LocalStoreData>;
    return {
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch {
    return { accounts: [], sessions: [] };
  }
}

function saveStore(data: LocalStoreData): void {
  try {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // Ignore local write errors
  }
}

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    32,
    "sha256",
  );
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 10_000) return false;
  const salt = Buffer.from(parts[2], "hex");
  const expected = Buffer.from(parts[3], "hex");
  const actual = crypto.pbkdf2Sync(
    password,
    salt,
    iterations,
    expected.length,
    "sha256",
  );
  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  );
}

function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return /^[A-Za-z0-9_-]{3,24}$/.test(trimmed) ? trimmed : null;
}

function normalizeCommanderName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  return trimmed.length >= 2 && trimmed.length <= 24 ? trimmed : null;
}

function sanitizeAchievements(
  raw: unknown,
): Array<{ mapName: string; difficulty: string }> {
  if (!Array.isArray(raw)) return [];
  const validDiffs = new Set(["Easy", "Medium", "Hard", "Impossible"]);
  const seen = new Set<string>();
  const out: Array<{ mapName: string; difficulty: string }> = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const mapName = (item as { mapName?: unknown }).mapName;
    const difficulty = (item as { difficulty?: unknown }).difficulty;
    if (
      typeof mapName !== "string" ||
      !mapName ||
      typeof difficulty !== "string" ||
      !validDiffs.has(difficulty)
    ) {
      continue;
    }
    const key = `${mapName}::${difficulty}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ mapName, difficulty });
  }
  return out;
}

function parseSessionCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE_NAME) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

function getAuthedAccount(
  req: Request,
  store: LocalStoreData,
): StoredAccount | null {
  const rawToken = parseSessionCookie(req);
  if (!rawToken) return null;
  const tokenHash = sha256Hex(rawToken);
  const now = Date.now();
  const session = store.sessions.find(
    (s) => s.tokenHash === tokenHash && s.expiresAt > now,
  );
  if (!session) return null;
  return store.accounts.find((a) => a.id === session.accountId) ?? null;
}

function issueSessionCookie(store: LocalStoreData, accountId: string): string {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(rawToken);
  const now = Date.now();
  store.sessions = store.sessions.filter((s) => s.expiresAt > now);
  store.sessions.push({
    tokenHash,
    accountId,
    expiresAt: now + SESSION_TTL_MS,
    createdAt: now,
  });
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE_NAME}=${rawToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

function publicAccountOf(a: StoredAccount) {
  return {
    id: a.id,
    username: a.username,
    commanderName: a.commanderName,
    achievements: a.achievements ?? [],
  };
}

// Local matchmaking queue for `npm run dev`
interface LocalMatchQueueEntry {
  persistentId: string;
  mode: "1v1" | "2v2";
  assignedGameId: string | null;
  queuedAt: number;
  lastSeen: number;
}
const localMatchQueue = new Map<string, LocalMatchQueueEntry>();

async function mintLocalWorkerGame(
  mode: "1v1" | "2v2",
): Promise<string | null> {
  const port = 3001 + Math.floor(Math.random() * ServerEnv.numWorkers());
  const adminKey = ServerEnv.adminBotKey();
  const payload = JSON.stringify({
    gameMap: "World",
    gameMapSize: mode === "1v1" ? "Compact" : "Normal",
    difficulty: "Medium",
    gameMode: mode === "2v2" ? "Team" : "Free For All",
    playerTeams: mode === "2v2" ? 2 : undefined,
    bots: mode === "1v1" ? 150 : 300,
    nations: "default",
    maxPlayers: mode === "2v2" ? 4 : 2,
  });

  return new Promise((resolve) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: adminKey ? "/api/adminbot/create_game" : "/api/create_game",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...(adminKey
            ? { [ServerEnv.adminBotHeader()]: adminKey }
            : { Authorization: `Bearer ${crypto.randomUUID()}` }),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(raw) as { gameID?: string };
            resolve(parsed.gameID ?? null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("error", () => resolve(null));
    req.write(payload);
    req.end();
  });
}

export function registerLocalCrownfallRoutes(app: Express): void {
  app.get("/api/auth/me", (req: Request, res: Response) => {
    const store = loadStore();
    const account = getAuthedAccount(req, store);
    res.json({ account: account ? publicAccountOf(account) : null });
  });

  app.post("/api/auth/register", (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const username = normalizeUsername(body.username);
    if (!username) {
      res.status(400).json({
        error:
          "Username must be 3–24 characters using letters, numbers, underscores, or hyphens.",
      });
      return;
    }
    if (typeof body.password !== "string" || body.password.length < 6) {
      res
        .status(400)
        .json({ error: "Password must be at least 6 characters long." });
      return;
    }
    const commanderName =
      normalizeCommanderName(body.commanderName) ?? username;
    const achievements = sanitizeAchievements(body.achievements);

    const store = loadStore();
    if (
      store.accounts.some(
        (a) => a.username.toLowerCase() === username.toLowerCase(),
      )
    ) {
      res.status(409).json({
        error: "That username is already taken. Try signing in instead.",
      });
      return;
    }

    const now = Date.now();
    const account: StoredAccount = {
      id: crypto.randomUUID(),
      username,
      commanderName,
      passwordHash: hashPassword(body.password),
      achievements,
      createdAt: now,
      updatedAt: now,
    };
    store.accounts.push(account);
    const cookie = issueSessionCookie(store, account.id);
    saveStore(store);

    res.setHeader("Set-Cookie", cookie);
    res.status(201).json({ account: publicAccountOf(account) });
  });

  app.post("/api/auth/login", (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const username = normalizeUsername(body.username);
    if (!username || typeof body.password !== "string") {
      res.status(400).json({ error: "Invalid username or password." });
      return;
    }

    const store = loadStore();
    const account = store.accounts.find(
      (a) => a.username.toLowerCase() === username.toLowerCase(),
    );
    if (!account || !verifyPassword(body.password, account.passwordHash)) {
      res.status(401).json({ error: "Incorrect username or password." });
      return;
    }

    const cookie = issueSessionCookie(store, account.id);
    saveStore(store);

    res.setHeader("Set-Cookie", cookie);
    res.json({ account: publicAccountOf(account) });
  });

  app.post("/api/auth/profile", (req: Request, res: Response) => {
    const store = loadStore();
    const account = getAuthedAccount(req, store);
    if (!account) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const commanderName = normalizeCommanderName(body.commanderName);
    if (!commanderName) {
      res
        .status(400)
        .json({ error: "Commander name must be 2–24 characters." });
      return;
    }
    account.commanderName = commanderName;
    account.updatedAt = Date.now();
    saveStore(store);
    res.json({ account: publicAccountOf(account) });
  });

  app.post("/api/auth/achievements", (req: Request, res: Response) => {
    const store = loadStore();
    const account = getAuthedAccount(req, store);
    if (!account) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const incoming = sanitizeAchievements(body.achievements);
    account.achievements = sanitizeAchievements([
      ...(account.achievements ?? []),
      ...incoming,
    ]);
    account.updatedAt = Date.now();
    saveStore(store);
    res.json({ account: publicAccountOf(account) });
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const rawToken = parseSessionCookie(req);
    if (rawToken) {
      const store = loadStore();
      const tokenHash = sha256Hex(rawToken);
      store.sessions = store.sessions.filter((s) => s.tokenHash !== tokenHash);
      saveStore(store);
    }
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    );
    res.json({ ok: true });
  });

  app.post("/api/mp/matchmaking", async (req: Request, res: Response) => {
    const now = Date.now();
    const body = (req.body ?? {}) as {
      action?: string;
      mode?: string;
      token?: string;
    };
    const mode: "1v1" | "2v2" = body.mode === "2v2" ? "2v2" : "1v1";
    const persistentId =
      typeof body.token === "string" && body.token.trim()
        ? body.token.trim()
        : crypto.randomUUID();
    const key = `${persistentId}::${mode}`;

    if (body.action === "leave") {
      localMatchQueue.delete(key);
      res.json({ ok: true });
      return;
    }

    for (const [k, entry] of localMatchQueue.entries()) {
      if (entry.lastSeen < now - 15_000) localMatchQueue.delete(k);
    }

    const existing = localMatchQueue.get(key);
    if (existing?.assignedGameId) {
      localMatchQueue.delete(key);
      res.json({
        type: "match-assignment",
        gameId: existing.assignedGameId,
      });
      return;
    }

    localMatchQueue.set(key, {
      persistentId,
      mode,
      assignedGameId: null,
      queuedAt: existing?.queuedAt ?? now,
      lastSeen: now,
    });

    const needed = mode === "2v2" ? 4 : 2;
    const unmatched = [...localMatchQueue.values()]
      .filter((e) => e.mode === mode && !e.assignedGameId)
      .sort((a, b) => a.queuedAt - b.queuedAt);

    if (unmatched.length >= needed) {
      const group = unmatched.slice(0, needed);
      const gameId = await mintLocalWorkerGame(mode);
      if (gameId) {
        for (const member of group) {
          const memberKey = `${member.persistentId}::${mode}`;
          if (member.persistentId === persistentId) {
            localMatchQueue.delete(memberKey);
          } else {
            member.assignedGameId = gameId;
          }
        }
        if (group.some((g) => g.persistentId === persistentId)) {
          res.json({ type: "match-assignment", gameId });
          return;
        }
      }
    }

    res.json({ type: "queue-size", count: unmatched.length });
  });
}

/**
 * In local dev (`npm run dev` / `run game.bat`), `ServerList.ts` and worker
 * `PrivilegeRefresher` probe `http://localhost:8787`. When `replay:api` is not
 * running separately, `ECONNREFUSED` after two 10s beats marks the backend
 * unreachable and locks out Create Lobby / Join Lobby / Ranked.
 *
 * Starting this lightweight listener on 127.0.0.1:8787 (quietly no-oping if
 * 8787 is already bound by `replay:api`) keeps local multiplayer healthy out of
 * the box.
 */
export function startDevStubApiIfNeeded(): void {
  if (ServerEnv.env() !== GameEnv.Dev) return;

  const stub = http.createServer((req, res) => {
    const origin = req.headers.origin ?? "http://localhost:9000";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Accept, Authorization, x-api-key",
    );

    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    const pathname = (req.url ?? "/").split("?")[0];
    if (pathname === "/cosmetics.json") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"patterns":{},"flags":{}}');
      return;
    }
    if (
      pathname === "/archive_singleplayer_game" ||
      pathname.endsWith("/heartbeat")
    ) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
      return;
    }
    if (pathname === "/reserved_clan_tags") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"tags":[]}');
      return;
    }

    const recordMatch = /^\/game\/([A-Za-z0-9_-]+)$/.exec(pathname);
    if (req.method === "GET" && recordMatch) {
      const recordFile = path.resolve(
        process.cwd(),
        "records",
        `${recordMatch[1]}.json`,
      );
      if (fs.existsSync(recordFile)) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(fs.readFileSync(recordFile));
        return;
      }
    }

    // 404 (below 500) signals a reachable dev API with no cluster list or legacy session
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end('{"error":"not found"}');
  });

  stub.on("error", () => {
    // Port 8787 is already bound (e.g. `npm run replay:api`); nothing to do.
  });

  stub.listen(8787, "127.0.0.1");
}
