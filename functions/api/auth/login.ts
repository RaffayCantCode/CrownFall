import {
  createSessionCookie,
  jsonResponse,
  normalizeUsername,
  type PagesContext,
  parseAchievementsJson,
  requireDb,
  verifyPassword,
} from "../_auth";

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const db = await requireDb(context.env);

  let body: { username?: unknown; password?: unknown };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const username = normalizeUsername(body.username);
  if (!username || typeof body.password !== "string") {
    return jsonResponse({ error: "Invalid username or password." }, 400);
  }

  const row = await db
    .prepare(
      "SELECT id, username, commander_name, password_hash, achievements_json FROM accounts WHERE username = ?",
    )
    .bind(username)
    .first<{
      id: string;
      username: string;
      commander_name: string;
      password_hash: string;
      achievements_json?: string;
    }>();

  if (!row || !(await verifyPassword(body.password, row.password_hash))) {
    return jsonResponse({ error: "Incorrect username or password." }, 401);
  }

  const cookie = await createSessionCookie(db, context.request, row.id);
  return jsonResponse(
    {
      account: {
        id: row.id,
        username: row.username,
        commanderName: row.commander_name,
        achievements: parseAchievementsJson(row.achievements_json),
      },
    },
    200,
    { "Set-Cookie": cookie },
  );
}
