/**
 * Crownfall Cloudflare Pages Functions — Shared Auth & Session Helpers.
 * Uses standard Web Crypto APIs so it runs natively on Cloudflare Pages Functions
 * with any D1 database bound as `DB` (plus automatic isolate fallback).
 */

import {
  type CrownfallEnv,
  type D1DatabaseLike,
  getDb,
  type PagesContext,
} from "./_db";

export type { CrownfallEnv, D1DatabaseLike, PagesContext };

export interface MapAchievementEntry {
  mapName: string;
  difficulty: string;
}

export interface PublicAccount {
  id: string;
  username: string;
  commanderName: string;
  achievements: MapAchievementEntry[];
}

const SESSION_COOKIE_NAME = "crownfall_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const PBKDF2_ITERATIONS = 100_000;

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

export async function requireDb(env: CrownfallEnv): Promise<D1DatabaseLike> {
  return getDb(env);
}

export function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^[A-Za-z0-9_-]{3,24}$/.test(trimmed)) return null;
  return trimmed;
}

export function normalizeCommanderName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2 || trimmed.length > 24) return null;
  return trimmed;
}

export function sanitizeAchievements(raw: unknown): MapAchievementEntry[] {
  if (!Array.isArray(raw)) return [];
  const validDiffs = new Set(["Easy", "Medium", "Hard", "Impossible"]);
  const seen = new Set<string>();
  const out: MapAchievementEntry[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const mapName = (item as { mapName?: unknown }).mapName;
    const difficulty = (item as { difficulty?: unknown }).difficulty;
    if (
      typeof mapName !== "string" ||
      mapName.length === 0 ||
      mapName.length > 64 ||
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

export function parseAchievementsJson(raw: unknown): MapAchievementEntry[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    return sanitizeAchievements(JSON.parse(raw));
  } catch {
    return [];
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(hex.length / 2);
  const out = new Uint8Array(buf);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return bytesToHex(new Uint8Array(digest));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(new ArrayBuffer(16));
  crypto.getRandomValues(salt);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(new Uint8Array(bits))}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 10_000) return false;
  const salt = hexToBytes(parts[2]);
  const expectedHex = parts[3];

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  const actualHex = bytesToHex(new Uint8Array(bits));
  if (actualHex.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < actualHex.length; i++) {
    diff |= actualHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return diff === 0;
}

function parseCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

function isSecureRequest(request: Request): boolean {
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return true;
  }
}

export async function createSessionCookie(
  db: D1DatabaseLike,
  request: Request,
  accountId: string,
): Promise<string> {
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const rawToken = bytesToHex(tokenBytes);
  const tokenHash = await sha256Hex(rawToken);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  await db
    .prepare(
      "INSERT INTO sessions (token_hash, account_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(tokenHash, accountId, expiresAt, now)
    .run();

  const secure = isSecureRequest(request) ? "; Secure" : "";
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE_NAME}=${rawToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie(request: Request): string {
  const secure = isSecureRequest(request) ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function getAuthenticatedAccount(
  db: D1DatabaseLike,
  request: Request,
): Promise<PublicAccount | null> {
  const rawToken = parseCookie(request, SESSION_COOKIE_NAME);
  if (!rawToken) return null;
  const tokenHash = await sha256Hex(rawToken);
  const now = Date.now();

  const row = await db
    .prepare(
      `SELECT a.id, a.username, a.commander_name, a.achievements_json
       FROM sessions s
       JOIN accounts a ON a.id = s.account_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .bind(tokenHash, now)
    .first<{
      id: string;
      username: string;
      commander_name: string;
      achievements_json?: string;
    }>();

  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    commanderName: row.commander_name,
    achievements: parseAchievementsJson(row.achievements_json),
  };
}

export async function revokeCurrentSession(
  db: D1DatabaseLike,
  request: Request,
): Promise<void> {
  const rawToken = parseCookie(request, SESSION_COOKIE_NAME);
  if (!rawToken) return;
  const tokenHash = await sha256Hex(rawToken);
  await db
    .prepare("DELETE FROM sessions WHERE token_hash = ?")
    .bind(tokenHash)
    .run();
}
