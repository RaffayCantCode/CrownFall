import {
  getAuthenticatedAccount,
  jsonResponse,
  type PagesContext,
  requireDb,
} from "../_auth";

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const db = await requireDb(context.env);
  const account = await getAuthenticatedAccount(db, context.request);
  return jsonResponse({ account }, 200);
}
