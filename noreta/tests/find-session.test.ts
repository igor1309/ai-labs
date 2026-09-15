import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { searchSessions } from "../src/search.js";
import { recentSessions } from "../src/sessions.js";
import { sourceOf } from "./session-source.js";
import { at } from "./time.js";
import { transcriptOf } from "./transcript-source.js";

describe("Feature: Find a session", () => {
  describe("Rule: Search covers session context and content", () => {
    it("Search sessions: rate limiter", () => {
      assert.deepEqual(found("rate limiter"), ["wanted"]);
    });

    it("Search sessions: ai-labs", () => {
      assert.deepEqual(found("ai-labs"), ["wanted"]);
    });

    it("Search sessions: feature/noreta", () => {
      assert.deepEqual(found("feature/noreta"), ["wanted"]);
    });

    it("Search sessions: codex", () => {
      assert.deepEqual(found("codex"), ["wanted"]);
    });
  });

  describe("Rule: Search covers sessions outside the recent history", () => {
    it("Search finds a session outside the recent history", () => {
      const sessions = sourceOf({
        id: "long-ago",
        agent: "claude",
        lastActivityAt: at("10:00"),
      });
      const transcripts = transcriptOf("long-ago", [
        { kind: "message", at: at("09:00"), role: "user", text: "the rate limiter again" },
      ]);
      const recency = { now: weeksLater, withinDays: 7 };
      assert.deepEqual(recentSessions(sessions, recency), [], "outside the recent history");

      assert.deepEqual(
        searchSessions(sessions, transcripts, "rate limiter").map((session) => session.id),
        ["long-ago"],
      );
    });
  });
});

const weeksLater = new Date("2026-09-29T10:00:00Z");

function found(query: string): string[] {
  const sessions = sourceOf(
    {
      id: "wanted",
      agent: "codex",
      repository: "ai-labs",
      branch: "feature/noreta",
    },
    { id: "other", agent: "claude", repository: "elsewhere", branch: "trunk" },
  );
  const transcripts = transcriptOf("wanted", [
    { kind: "message", at: at("10:01"), role: "user", text: "fix the rate limiter" },
  ]);

  return searchSessions(sessions, transcripts, query).map((session) => session.id);
}
