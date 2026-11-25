import { type PagesContext } from "./_db";
import { handleCreateGame } from "./_mp";

export async function onRequestPost(context: PagesContext): Promise<Response> {
  return handleCreateGame(context);
}
