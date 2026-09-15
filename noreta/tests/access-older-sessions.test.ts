import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { olderSessions, recentSessions } from "../src/sessions.js";
import { readTranscript } from "../src/transcript.js";
import {
  changingSource,
  isActive,
  type ScenarioSource,
  sessionsOf,
  sourceOf,
} from "./session-source.js";
import { at } from "./time.js";
import { describeEntry, transcriptOf } from "./transcript-source.js";

describe("Feature: Access older sessions", () => {
  describe("Rule: Sessions remain available outside the recent history", () => {
    it("Reveal sessions outside the recent history", () => {
      const sessions = sessionsOf(
        { id: "recent", lastActivityAt: at("10:00") },
        { id: "long-ago", lastActivityAt: new Date("2026-01-01T00:00:00Z") },
        { id: "longer-ago", lastActivityAt: new Date("2025-06-01T00:00:00Z") },
      );
      const recency = { now: at("10:00"), withinDays: 7 };
      assert.deepEqual(ids(recentSessions(sessions, recency, isActive)), ["recent"]);

      assert.deepEqual(ids(olderSessions(sessions, recency, isActive)), [
        "long-ago",
        "longer-ago",
      ]);
    });
  });

  describe("Rule: A session retains its historical working context", () => {
    it("Its worktree has been deleted", () => {
      const worktree = "/repos/ai-labs.worktrees/product-noreta";
      const source = changingSource(inWorktree(worktree, { onDisk: true }));
      assert.deepEqual(workspaceOf(source.read), {
        workspace: worktree,
        repository: "ai-labs",
        workspaceOnDisk: true,
      });

      source.replaceWith(inWorktree(worktree, { onDisk: false }));

      assert.deepEqual(
        workspaceOf(source.read),
        { workspace: worktree, repository: "ai-labs", workspaceOnDisk: false },
        "still that worktree, now shown as gone from disk",
      );
    });

    it("Open a session from a deleted worktree", () => {
      const source = sourceOf(
        inWorktree("/repos/ai-labs.worktrees/product-noreta", { onDisk: false }),
      );
      const transcripts = transcriptOf("in-worktree", [
        { kind: "message", at: at("10:01"), role: "user", text: "what did we decide" },
      ]);
      assert.equal(source()[0].workspaceOnDisk, false);

      assert.deepEqual(readTranscript(transcripts, "in-worktree").map(describeEntry), [
        "what did we decide",
      ]);
    });
  });
});

function inWorktree(worktree: string, { onDisk }: { onDisk: boolean }) {
  return {
    id: "in-worktree",
    workspace: worktree,
    repository: "ai-labs",
    workspaceOnDisk: onDisk,
    lastActivityAt: at("10:00"),
  };
}

function workspaceOf(source: ScenarioSource) {
  const [session] = source();

  return {
    workspace: session.workspace,
    repository: session.repository,
    workspaceOnDisk: session.workspaceOnDisk,
  };
}

function ids(sessions: { id: string }[]): string[] {
  return sessions.map((session) => session.id);
}
