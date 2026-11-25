import {
  clearSessionCookie,
  jsonResponse,
  type PagesContext,
  requireDb,
  revokeCurrentSession,
} from "../_auth";

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const dbOrError = requireDb(context.env);
  if (dbOrError instanceof Response) return dbOrError;

  await revokeCurrentSession(dbOrError, context.request);
  return jsonResponse({ ok: true }, 200, {
    "Set-Cookie": clearSessionCookie(context.request),
  });
}
