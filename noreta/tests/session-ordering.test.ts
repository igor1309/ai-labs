import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { viewSessions } from "../src/sessions.js";
import { sourceOf } from "./session-source.js";

// Edge cases behind "Recent sessions are ordered by last activity". Not QA
// scenarios, so they live outside the scenario-named files.
describe("Ordering by last activity", () => {
  it("keeps valid sessions ordered around an unreadable timestamp", () => {
    const source = sourceOf(
      { id: "old", lastActivityAt: new Date("2026-01-01T00:00:00Z") },
      { id: "unreadable", lastActivityAt: new Date("not a date") },
      { id: "new", lastActivityAt: new Date("2026-09-15T00:00:00Z") },
    );

    assert.deepEqual(
      viewSessions(source).map((session) => session.id),
      ["new", "old", "unreadable"],
    );
  });

  it("orders several unreadable timestamps without disturbing the valid ones", () => {
    const source = sourceOf(
      { id: "unreadable-first", lastActivityAt: new Date("nonsense") },
      { id: "dated", lastActivityAt: new Date("2026-05-05T00:00:00Z") },
      { id: "unreadable-second", lastActivityAt: new Date("also nonsense") },
    );

    assert.deepEqual(
      viewSessions(source).map((session) => session.id),
      ["dated", "unreadable-first", "unreadable-second"],
    );
  });

  it("keeps source order for sessions sharing a last activity time", () => {
    const sameMoment = new Date("2026-03-03T00:00:00Z");
    const source = sourceOf(
      { id: "first", lastActivityAt: sameMoment },
      { id: "second", lastActivityAt: sameMoment },
    );

    assert.deepEqual(
      viewSessions(source).map((session) => session.id),
      ["first", "second"],
    );
  });
});
