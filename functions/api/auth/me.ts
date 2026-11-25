import {
  getAuthenticatedAccount,
  jsonResponse,
  type PagesContext,
  requireDb,
} from "../_auth";

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const dbOrError = requireDb(context.env);
  if (dbOrError instanceof Response) return dbOrError;

  const account = await getAuthenticatedAccount(dbOrError, context.request);
  return jsonResponse({ account }, 200);
}
