import { jsonResponse } from "../_auth";
import { type PagesContext } from "../_db";
import { handleGetLobbies, handleMatchmaking, handleSync } from "../_mp";

export async function onRequest(context: PagesContext): Promise<Response> {
  const raw = context.params?.path;
  const subpath = Array.isArray(raw) ? raw.join("/") : (raw ?? "");
  const method = context.request.method.toUpperCase();

  if (method === "GET" && subpath === "lobbies") {
    return handleGetLobbies(context);
  }
  if (method === "POST" && subpath === "sync") {
    return handleSync(context);
  }
  if (method === "POST" && subpath === "matchmaking") {
    return handleMatchmaking(context);
  }
  return jsonResponse({ error: "Not found" }, 404);
}
