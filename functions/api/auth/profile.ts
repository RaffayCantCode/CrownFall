import {
  getAuthenticatedAccount,
  jsonResponse,
  normalizeCommanderName,
  type PagesContext,
  requireDb,
} from "../_auth";

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const dbOrError = requireDb(context.env);
  if (dbOrError instanceof Response) return dbOrError;
  const db = dbOrError;

  const account = await getAuthenticatedAccount(db, context.request);
  if (!account) {
    return jsonResponse({ error: "Not signed in." }, 401);
  }

  let body: { commanderName?: unknown };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const commanderName = normalizeCommanderName(body.commanderName);
  if (!commanderName) {
    return jsonResponse(
      { error: "Commander name must be 2–24 characters." },
      400,
    );
  }

  await db
    .prepare("UPDATE accounts SET commander_name = ?, updated_at = ? WHERE id = ?")
    .bind(commanderName, Date.now(), account.id)
    .run();

  return jsonResponse(
    {
      account: {
        ...account,
        commanderName,
      },
    },
    200,
  );
}
