import { type PagesContext } from "../api/_db";
import { handleWorkerSubroute } from "../api/_mp";

export async function onRequest(context: PagesContext): Promise<Response> {
  const raw = context.params?.path;
  const subpath = Array.isArray(raw) ? raw.join("/") : (raw ?? "");
  return handleWorkerSubroute(context, subpath);
}
