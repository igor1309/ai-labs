import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { recentSessions } from "../src/sessions.js";
import { isActive, newestFirst, sessionsOf } from "./session-source.js";
import { at } from "./time.js";

describe("Feature: See recent sessions", () => {
  describe("Rule: Inactive sessions expose their last activity", () => {
    it("An inactive session is shown", () => {
      const lastActivityAt = new Date("2026-09-15T10:00:00Z");
      const sessions = sessionsOf({ id: "s1", lastActivityAt });

      assert.deepEqual(sessions, [
        {
          id: "s1",
          agent: "claude",
          workspace: "/workspace",
          workspaceOnDisk: true,
          lastActivityAt,
        },
      ]);
    });
  });

  describe("Rule: Recent work is available in the default view", () => {
    it("A recently inactive session exists", () => {
      const sessions = sessionsOf(
        { id: "live", runtimeState: "working", lastActivityAt: at("10:00") },
        { id: "just-finished", lastActivityAt: at("09:59") },
        { id: "long-forgotten", lastActivityAt: new Date("2026-01-01T00:00:00Z") },
      );

      assert.deepEqual(
        recentSessions(sessions, { now: at("10:00"), withinDays: 7 }, isActive).map(
          (session) => session.id,
        ),
        ["live", "just-finished"],
      );
    });

    it("Recent sessions are ordered by last activity", () => {
      const sessions = sessionsOf(
        { id: "middle", lastActivityAt: at("09:00") },
        { id: "oldest", lastActivityAt: at("08:00") },
        { id: "newest", lastActivityAt: at("10:00") },
      );

      assert.deepEqual(
        recentSessions(newestFirst(sessions), { now: at("10:00"), withinDays: 7 }, isActive).map(
          (session) => session.id,
        ),
        ["newest", "middle", "oldest"],
      );
    });
  });
});
