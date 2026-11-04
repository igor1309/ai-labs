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
