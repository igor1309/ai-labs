import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { handleRequest as notify } from "../notify-insights/handler.ts";
import { handleRequest as bot } from "../telegram-bot/handler.ts";

for (const entry of ["/latest", "/start", "notify"]) {
  Deno.test(`${entry} obtains and passes the prior snapshot to the formatter`, async () => {
    const env = { BOT_TOKEN: "test", INBOX_CHAT_ID: "123", SUPABASE_URL: "https://db.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "test" };
    const old = Object.fromEntries(Object.keys(env).map((key) => [key, Deno.env.get(key)]));
    const originalFetch = globalThis.fetch;
    const requests: string[] = [];
    let markdown = "";
    const row = { week: "2026-10-12", total_sessions: 3, total_duration_minutes: 60,
      total_user_messages: 4, lines_added: 1, lines_removed: 0, total_commits: 1,
      context_hygiene: { claude: { score: 5 } } };
    const previous = { week: "2026-10-05", context_hygiene: { claude: { score: 8 } } };
    for (const [key, value] of Object.entries(env)) Deno.env.set(key, value);
    globalThis.fetch = ((url, init) => {
      requests.push(String(url));
      if (String(url).startsWith(env.SUPABASE_URL)) {
        return Promise.resolve(Response.json(entry === "notify" ? [previous] : [row, previous]));
      }
      markdown = JSON.parse(String(init?.body)).rich_message.markdown;
      return Promise.resolve(new Response("ok"));
    }) as typeof fetch;
    try {
      const payload = entry === "notify" ? { record: row } : { message: { text: entry, chat: { id: 123 } } };
      const response = await (entry === "notify" ? notify : bot)(new Request("https://local.invalid", {
        method: "POST", body: JSON.stringify(payload),
      }));
      assertEquals(response.status, 200);
      assertStringIncludes(requests[0], entry === "notify"
        ? "week=lt.2026-10-12&order=week.desc&limit=1" : "order=week.desc&limit=2");
      assertStringIncludes(markdown, "score 5 (Δ -3)");
      assertEquals(requests.length, 2);
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries(old)) {
        if (value === undefined) Deno.env.delete(key);
        else Deno.env.set(key, value);
      }
    }
  });
}

for (const failure of ["missing-url", "missing-key", "http-error", "network-error", "invalid-json", "invalid-shape", "no-history"]) {
  Deno.test(`notify still delivers the current digest on ${failure}`, async () => {
    const env: Record<string, string> = {
      BOT_TOKEN: "test", INBOX_CHAT_ID: "123", SUPABASE_URL: "https://db.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "test",
    };
    const old = Object.fromEntries(Object.keys(env).map((key) => [key, Deno.env.get(key)]));
    const originalFetch = globalThis.fetch;
    let sent = 0;
    let markdown = "";
    for (const [key, value] of Object.entries(env)) Deno.env.set(key, value);
    if (failure === "missing-url") Deno.env.delete("SUPABASE_URL");
    if (failure === "missing-key") Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
    globalThis.fetch = (async (url, init) => {
      if (String(url).startsWith(env.SUPABASE_URL)) {
        if (failure === "network-error") throw new TypeError("unavailable");
        if (failure === "http-error") return new Response("unavailable", { status: 500 });
        if (failure === "invalid-json") return new Response("invalid JSON");
        return Response.json(failure === "invalid-shape" ? null : []);
      }
      assertEquals(String(url), "https://api.telegram.org/bottest/sendRichMessage");
      const payload = JSON.parse(String(init?.body));
      assertEquals(payload.chat_id, "123");
      markdown = payload.rich_message.markdown;
      sent++;
      return new Response("ok");
    }) as typeof fetch;
    try {
      const response = await notify(new Request("https://local.invalid", {
        method: "POST", body: JSON.stringify({ record: {
          week: "2026-10-12", total_sessions: 3, total_duration_minutes: 60,
          total_user_messages: 4, lines_added: 1, lines_removed: 0, total_commits: 1,
          context_hygiene: { claude: { score: 5 } },
        } }),
      }));
      assertEquals(response.status, 200);
      assertEquals(sent, 1);
      assertStringIncludes(markdown, "score 5");
      assertEquals(markdown.includes("Δ"), false);
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries(old)) {
        if (value === undefined) Deno.env.delete(key);
        else Deno.env.set(key, value);
      }
    }
  });
}
