import { jsonResponse } from "../_auth";
import { type PagesContext } from "../_db";
import { handleGameExists, handleGetGame, handleListing } from "../_mp";

export async function onRequest(context: PagesContext): Promise<Response> {
  const raw = context.params?.path;
  const parts = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const method = context.request.method.toUpperCase();

  if (parts.length === 1 && method === "GET") {
    return handleGetGame(context, parts[0]);
  }
  if (parts.length === 2 && parts[1] === "exists" && method === "GET") {
    return handleGameExists(context, parts[0]);
  }
  if (parts.length === 2 && parts[1] === "listing" && method === "POST") {
    return handleListing(context, parts[0]);
  }
  return jsonResponse({ error: "Not found" }, 404);
}
