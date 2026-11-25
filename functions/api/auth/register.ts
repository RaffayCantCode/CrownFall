import {
  createSessionCookie,
  hashPassword,
  jsonResponse,
  normalizeCommanderName,
  normalizeUsername,
  type PagesContext,
  requireDb,
} from "../_auth";

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const dbOrError = requireDb(context.env);
  if (dbOrError instanceof Response) return dbOrError;
  const db = dbOrError;

  let body: {
    username?: unknown;
    password?: unknown;
    commanderName?: unknown;
  };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const username = normalizeUsername(body.username);
  if (!username) {
    return jsonResponse(
      {
        error:
          "Username must be 3–24 characters using letters, numbers, underscores, or hyphens.",
      },
      400,
    );
  }

  if (typeof body.password !== "string" || body.password.length < 6) {
    return jsonResponse(
      { error: "Password must be at least 6 characters long." },
      400,
    );
  }

  const commanderName =
    normalizeCommanderName(body.commanderName) ?? username;

  const existing = await db
    .prepare("SELECT id FROM accounts WHERE username = ?")
    .bind(username)
    .first<{ id: string }>();
  if (existing) {
    return jsonResponse(
      { error: "That username is already taken. Try signing in instead." },
      409,
    );
  }

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(body.password);
  const now = Date.now();

  await db
    .prepare(
      "INSERT INTO accounts (id, username, commander_name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(id, username, commanderName, passwordHash, now, now)
    .run();

  const cookie = await createSessionCookie(db, context.request, id);
  return jsonResponse(
    {
      account: { id, username, commanderName },
    },
    201,
    { "Set-Cookie": cookie },
  );
}
