import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { formatInsights, sendTelegram } from "./format.ts";

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    week: "2026-W23",
    total_sessions: 42,
    total_duration_minutes: 720,
    total_user_messages: 318,
    lines_added: 1234,
    lines_removed: 567,
    total_commits: 27,
    friction: null,
    satisfaction: null,
    goals: null,
    narrative_summary: null,
    ...overrides,
  };
}

Deno.test("formatInsights includes the week", () => {
  assertStringIncludes(formatInsights(makeRow()), "2026-W23");
});

Deno.test("formatInsights renders the header as a Markdown heading", () => {
  const lines = formatInsights(makeRow()).split("\n");
  assertEquals(lines.some((l) => /^# /.test(l)), true);
});

Deno.test("formatInsights renders friction as a transposed table, top 3 by count", () => {
  const out = formatInsights(makeRow({
    friction: { rate_limits: 5, slow_tools: 3, context_loss: 2, minor_nit: 1 },
  }));
  assertStringIncludes(out, "## 🔴 Friction");
  assertStringIncludes(out, "| rate limits | slow tools | context loss |");
  assertStringIncludes(out, "| 5 | 3 | 2 |");
  assertEquals(out.includes("minor nit"), false);
});

Deno.test("formatInsights renders satisfaction as a transposed table, all entries", () => {
  const out = formatInsights(makeRow({ satisfaction: { fast: 9, accurate: 7 } }));
  assertStringIncludes(out, "## 😊 Satisfaction");
  assertStringIncludes(out, "| fast | accurate |");
  assertStringIncludes(out, "| 9 | 7 |");
});

Deno.test("formatInsights renders goals as a transposed table, top 5 by count", () => {
  const out = formatInsights(makeRow({
    goals: { g1: 6, g2: 5, g3: 4, g4: 3, g5: 2, g6: 1 },
  }));
  assertStringIncludes(out, "## 🎯 Top goals");
  assertStringIncludes(out, "| g1 | g2 | g3 | g4 | g5 |");
  assertStringIncludes(out, "| 6 | 5 | 4 | 3 | 2 |");
  assertEquals(out.includes("g6"), false);
});

Deno.test("formatInsights renders narrative sections as headings + blockquotes, no details", () => {
  const out = formatInsights(makeRow({
    narrative_summary:
      "What's working: Great velocity.\n\nWhat's hindering progress: Rate limits.",
  }));
  assertStringIncludes(out, "## ✅ What's working");
  assertStringIncludes(out, "> Great velocity.");
  assertStringIncludes(out, "## ⚠️ What's hindering");
  assertEquals(out.includes("<details"), false);
});

Deno.test("sendTelegram posts a markdown rich message to sendRichMessage", async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return Promise.resolve(new Response("ok", { status: 200 }));
  }) as typeof fetch;
  try {
    await sendTelegram("TOKEN", "123", "# Hello");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assertEquals(calls.length, 1);
  assertEquals(calls[0].url.endsWith("/sendRichMessage"), true);
  assertEquals("text" in calls[0].body, false);
  assertEquals("parse_mode" in calls[0].body, false);
  assertEquals(
    (calls[0].body.rich_message as Record<string, unknown>).markdown,
    "# Hello",
  );
});

Deno.test("formatInsights caps output at 32768 characters", () => {
  const out = formatInsights(makeRow({ narrative_summary: "x".repeat(40000) }));
  assertEquals(out.length <= 32768, true);
});

Deno.test("formatInsights renders stats as a transposed Markdown table", () => {
  const out = formatInsights(makeRow());
  assertStringIncludes(out, "| Sessions | Duration | Messages | Commits | Lines |");
  assertStringIncludes(out, "| 42 | 12h | 318 | 27 | +1234 / -567 |");
});
