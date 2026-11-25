import {
  clearSessionCookie,
  jsonResponse,
  type PagesContext,
  requireDb,
  revokeCurrentSession,
} from "../_auth";

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const db = await requireDb(context.env);

  await revokeCurrentSession(db, context.request);
  return jsonResponse({ ok: true }, 200, {
    "Set-Cookie": clearSessionCookie(context.request),
  });
}
