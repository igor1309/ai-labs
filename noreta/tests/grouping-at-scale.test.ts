import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { groupSessions } from "../src/grouping.js";
import type { ObservedSession } from "../src/sessions.js";

// Not a QA scenario. Grouping by agent is the worst case and the likeliest one:
// a user has two or three agents, so every session lands in one group. Building
// each group by copying it made that quadratic: 1.7s for 40,000 sessions.
//
// The bound is measured rather than left to `it`'s timeout, which does not
// interrupt synchronous work. 50,000 sessions take ~15ms once each group's array
// is allocated once, and ~3s when every insertion copies the group — so 500ms
// sits far above the linear cost even on a slow machine and far below the
// quadratic one.
describe("Grouping a long history", () => {
  it("puts 50,000 sessions in one group without copying it each time", () => {
    const sessions = manySessions(50_000);

    const started = process.hrtime.bigint();
    const groups = groupSessions(sessions, "agent");
    const elapsedMilliseconds = Number(process.hrtime.bigint() - started) / 1e6;

    assert.equal(groups.length, 1);
    assert.equal(groups[0].sessions.length, sessions.length);
    assert.ok(
      elapsedMilliseconds < 500,
      `grouping 50,000 sessions took ${elapsedMilliseconds.toFixed(0)}ms, which means it is no longer linear`,
    );
  });
});

function manySessions(count: number): ObservedSession[] {
  return Array.from({ length: count }, (unused, index) => ({
    id: `s${index}`,
    agent: "claude",
    workspace: "/workspace",
    workspaceOnDisk: true,
    lastActivityAt: new Date("2026-09-15T10:00:00Z"),
  }));
}
