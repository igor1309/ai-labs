import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { analyzeTrends } from "./llm.ts";

Deno.test("compare sends hygiene series with old weeks unavailable and private data excluded", async () => {
  const originalFetch = globalThis.fetch;
  const oldUrl = Deno.env.get("NOMOS_BASE_URL");
  const oldKey = Deno.env.get("NOMOS_API_KEY");
  let body: Record<string, unknown> = {};
  Deno.env.set("NOMOS_BASE_URL", "https://nomos.invalid");
  Deno.env.set("NOMOS_API_KEY", "test");
  globalThis.fetch = ((_url, init) => {
    body = JSON.parse(String(init?.body));
    return Promise.resolve(Response.json({ choices: [{ message: { content: "trend result" } }] }));
  }) as typeof fetch;
  try {
    const result = await analyzeTrends([
      { week: "2026-10-19", context_hygiene: {
        claude: { sessions: 10, score: 9, tokens: { input: 200, output: 20, path: "secret" }, project: "secret" },
        codex: { sessions: 3, score: 4, tokens: { input: 100 } },
      }, raw_html: "secret" },
      { week: "2026-10-12", context_hygiene: { claude: { sessions: 5, score: 15 } } },
      { week: "2026-10-05", context_hygiene: null },
      { week: "2026-09-28" },
    ]);
    assertEquals(result, "trend result");
    const messages = body.messages as { role: string; content: string }[];
    assertStringIncludes(messages[0].content, "unavailable, not zero");
    const series = JSON.parse(messages[1].content.split("\n\n")[1]);
    assertEquals(series.map((r: Record<string, unknown>) => [r.week, r.context_hygiene]), [
      ["2026-10-19", { claude: { sessions: 10, score: 9, tokens: { input: 200, output: 20 } },
        codex: { sessions: 3, score: 4, tokens: { input: 100 } } }],
      ["2026-10-12", { claude: { sessions: 5, score: 15, tokens: {} } }],
      ["2026-10-05", null], ["2026-09-28", null],
    ]);
    assertEquals(JSON.stringify(body).includes("secret"), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl === undefined) Deno.env.delete("NOMOS_BASE_URL");
    else Deno.env.set("NOMOS_BASE_URL", oldUrl);
    if (oldKey === undefined) Deno.env.delete("NOMOS_API_KEY");
    else Deno.env.set("NOMOS_API_KEY", oldKey);
  }
});
