import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { groupBy, type Group } from "../src/grouping.js";
import { activeSessions } from "../src/sessions.js";
import { isActive, type ScenarioSession, sessionsOf } from "./session-source.js";

describe("Feature: Organize sessions", () => {
  describe("Rule: Sessions can be grouped by working context", () => {
    it("Group by repository", () => {
      const sessions = sessionsOf(
        { id: "a", repository: "ai-labs" },
        { id: "b", repository: "elsewhere" },
        { id: "c", repository: "ai-labs" },
        { id: "loose" },
      );

      const groups = groupBy(sessions, (session) => session.repository);

      assert.deepEqual(membership(groups), {
        "ai-labs": ["a", "c"],
        elsewhere: ["b"],
        "(none)": ["loose"],
      });
      eachSessionAppearsExactlyOnce(groups, sessions);
    });

    it("Group by workspace", () => {
      const sessions = sessionsOf(
        { id: "a", workspace: "/repos/ai-labs" },
        { id: "b", workspace: "/repos/ai-labs.worktrees/product-noreta" },
        { id: "c", workspace: "/repos/ai-labs" },
      );

      const groups = groupBy(sessions, (session) => session.workspace);

      assert.deepEqual(membership(groups), {
        "/repos/ai-labs": ["a", "c"],
        "/repos/ai-labs.worktrees/product-noreta": ["b"],
      });
      eachSessionAppearsExactlyOnce(groups, sessions);
    });

    it("Group by agent", () => {
      const sessions = sessionsOf(
        { id: "a", agent: "claude" },
        { id: "b", agent: "codex" },
        { id: "c", agent: "claude" },
      );

      const groups = groupBy(sessions, (session) => session.agent);

      assert.deepEqual(membership(groups), {
        claude: ["a", "c"],
        codex: ["b"],
      });
      eachSessionAppearsExactlyOnce(groups, sessions);
    });
  });

  describe("Rule: Sessions can be filtered by their attributes", () => {
    it("Filter active sessions", () => {
      const sessions = sessionsOf(
        { id: "working", runtimeState: "working" },
        { id: "waiting", runtimeState: "waiting-for-input" },
        { id: "idle", runtimeState: "idle" },
        { id: "inactive" },
      );

      const shown = activeSessions(sessions, isActive).map((session) => session.id);

      assert.deepEqual([...shown].sort(), ["idle", "waiting", "working"]);
      assert.equal(shown.includes("inactive"), false);
    });
  });
});

// A context a session may not have groups the ones that lack it under no key,
// so these assertions read every grouping in the same shape.
type SessionGroup = Group<ScenarioSession, string | undefined>;

function membership(groups: SessionGroup[]): Record<string, string[]> {
  return Object.fromEntries(
    groups.map((group) => [group.key ?? "(none)", group.items.map((s) => s.id)]),
  );
}

function eachSessionAppearsExactlyOnce(
  groups: SessionGroup[],
  sessions: ScenarioSession[],
): void {
  const placed = groups.flatMap((group) => group.items.map((session) => session.id));

  assert.deepEqual(
    [...placed].sort(),
    sessions.map((session) => session.id).sort(),
    "every session should be placed",
  );
  assert.equal(new Set(placed).size, placed.length, "no session should be placed twice");
}
