import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { searchSessions } from "../src/search.js";
import { recentSessions, viewSessions } from "../src/sessions.js";
import type { TranscriptSource } from "../src/transcript.js";
import { sourceOf } from "./session-source.js";
import { at } from "./time.js";
import { transcriptOf } from "./transcript-source.js";

describe("Feature: Find a session", () => {
  describe("Rule: Search covers session context and content", () => {
    it("Search sessions: rate limiter", () => {
      assert.deepEqual(found("rate limiter"), ["by-message-text"]);
    });

    it("Search sessions: ai-labs", () => {
      assert.deepEqual(found("ai-labs"), ["by-repository"]);
    });

    it("Search sessions: feature/noreta", () => {
      assert.deepEqual(found("feature/noreta"), ["by-branch"]);
    });

    it("Search sessions: codex", () => {
      assert.deepEqual(found("codex"), ["by-agent"]);
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
      assert.deepEqual(recentSessions(viewSessions(sessions), recency), [], "outside the recent history");

      assert.deepEqual(
        searchSessions(sessions, transcripts, "rate limiter").matches.map(
          (session) => session.id,
        ),
        ["long-ago"],
      );
    });
  });

  describe("Rule: An unreadable transcript does not hide the other results", () => {
    it("A transcript cannot be read", () => {
      const sessions = sourceOf(
        { id: "unreadable", agent: "claude", lastActivityAt: at("10:00") },
        { id: "readable", agent: "claude", lastActivityAt: at("09:00") },
      );
      const transcripts: TranscriptSource = (sessionId) => {
        if (sessionId === "unreadable") {
          throw new Error("transcript unreadable");
        }

        return [
          { kind: "message", at: at("09:01"), role: "user", text: "fix the rate limiter" },
        ];
      };

      const results = searchSessions(sessions, transcripts, "rate limiter");

      assert.deepEqual(results.matches.map((session) => session.id), ["readable"]);
      assert.deepEqual(results.unreadable, ["unreadable"]);
    });
  });
});

const weeksLater = new Date("2026-09-29T10:00:00Z");

// One session per dimension, each matching on that dimension alone, so a test
// fails when its own dimension breaks rather than being carried by another.
function found(query: string): string[] {
  const sessions = sourceOf(
    { id: "by-agent", agent: "codex", repository: "unrelated", branch: "unrelated" },
    { id: "by-repository", agent: "claude", repository: "ai-labs", branch: "unrelated" },
    { id: "by-branch", agent: "claude", repository: "unrelated", branch: "feature/noreta" },
    { id: "by-message-text", agent: "claude", repository: "unrelated", branch: "unrelated" },
  );
  const transcripts = transcriptOf("by-message-text", [
    { kind: "message", at: at("10:01"), role: "user", text: "fix the rate limiter" },
  ]);

  return searchSessions(sessions, transcripts, query).matches.map((session) => session.id);
}
