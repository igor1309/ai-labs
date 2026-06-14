import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { formatInsights } from "./format.ts";

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
