import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { olderSessions, recentSessions, viewSessions } from "../src/sessions.js";
import { sourceOf } from "./session-source.js";
import { at } from "./time.js";

// Not a QA scenario, but the property both rules lean on: the cutoff holds
// sessions back, it never drops them. A session in neither list would be
// unreachable from the UI, which is the failure the notes call out.
describe("Recent and older sessions", () => {
  const sessions = viewSessions(
    sourceOf(
      { id: "live-but-stale", runtimeState: "working", lastActivityAt: longAgo() },
      { id: "recent", lastActivityAt: at("10:00") },
      { id: "old", lastActivityAt: longAgo() },
      { id: "unreadable", lastActivityAt: new Date("not a date") },
    ),
  );
  const recency = { now: at("10:00"), withinDays: 7 };

  it("together account for every session exactly once", () => {
    const split = [...recentSessions(sessions, recency), ...olderSessions(sessions, recency)];
    const ids = split.map((session) => session.id);

    assert.deepEqual([...ids].sort(), sessions.map((session) => session.id).sort());
    assert.equal(new Set(ids).size, ids.length, "no session should appear in both");
  });

  it("keeps an active session in the recent list however old its last activity", () => {
    assert.ok(
      recentSessions(sessions, recency).some((session) => session.id === "live-but-stale"),
    );
  });

  it("reveals a session whose last activity cannot be read", () => {
    assert.ok(olderSessions(sessions, recency).some((session) => session.id === "unreadable"));
  });
});

function longAgo(): Date {
  return new Date("2025-06-01T00:00:00Z");
}
