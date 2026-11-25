import {
  getAuthenticatedAccount,
  jsonResponse,
  type PagesContext,
  requireDb,
  sanitizeAchievements,
} from "../_auth";

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const db = await requireDb(context.env);

  const account = await getAuthenticatedAccount(db, context.request);
  if (!account) {
    return jsonResponse({ error: "Not signed in." }, 401);
  }

  let body: { achievements?: unknown };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const incoming = sanitizeAchievements(body.achievements);
  const merged = sanitizeAchievements([...account.achievements, ...incoming]);

  await db
    .prepare(
      "UPDATE accounts SET achievements_json = ?, updated_at = ? WHERE id = ?",
    )
    .bind(JSON.stringify(merged), Date.now(), account.id)
    .run();

  return jsonResponse(
    {
      account: {
        ...account,
        achievements: merged,
      },
    },
    200,
  );
}
