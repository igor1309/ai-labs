import type { Env } from "./api/auth";
import { handleItems } from "./api/items";
import { json } from "./api/response";
import { CLIPDECK_VERSION } from "./version";

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/items") {
      return handleItems(request, env);
    }

    if (url.pathname === "/api/version") {
      return json({ version: CLIPDECK_VERSION });
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("clipdeck");
  }
} satisfies ExportedHandler<Env>;
