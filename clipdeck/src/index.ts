import type { Env } from "./api/auth";
import { handleItems } from "./api/items";

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/items") {
      return handleItems(request, env);
    }

    return new Response("clipdeck");
  }
} satisfies ExportedHandler<Env>;
