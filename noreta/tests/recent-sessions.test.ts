import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { viewSessions } from "../src/sessions.js";
import { sourceOf } from "./session-source.js";

describe("Feature: See recent sessions", () => {
  describe("Rule: Inactive sessions expose their last activity", () => {
    it("An inactive session is shown", () => {
      const lastActivityAt = new Date("2026-09-15T10:00:00Z");
      const source = sourceOf({ id: "s1", lastActivityAt });

      assert.deepEqual(viewSessions(source), [
        { id: "s1", active: false, waiting: false, lastActivityAt },
      ]);
    });
  });

  describe("Rule: Recent work is available in the default view", () => {
    it("A recently inactive session exists", () => {
      const source = sourceOf(
        { id: "live", runtimeState: "working", lastActivityAt: at("10:00") },
        { id: "just-finished", lastActivityAt: at("09:59") },
      );

      assert.deepEqual(
        viewSessions(source).map((session) => session.id),
        ["live", "just-finished"],
      );
    });

    it("Recent sessions are ordered by last activity", () => {
      const source = sourceOf(
        { id: "middle", lastActivityAt: at("09:00") },
        { id: "oldest", lastActivityAt: at("08:00") },
        { id: "newest", lastActivityAt: at("10:00") },
      );

      assert.deepEqual(
        viewSessions(source).map((session) => session.id),
        ["newest", "middle", "oldest"],
      );
    });
  });
});

function at(time: string): Date {
  return new Date(`2026-09-15T${time}:00Z`);
}
