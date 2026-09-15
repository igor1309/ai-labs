import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { viewSessions } from "../src/sessions.js";
import { sourceOf, stateOf } from "./session-source.js";

// Not QA scenarios: the runtime states no scenario names. A source can know a
// session is blocked without knowing what on — Claude Code's registry reports
// that it is waiting, never whether the answer it wants is input or approval.
describe("Waiting without knowing what for", () => {
  it("is active and waiting", () => {
    const [view] = viewSessions(sourceOf({ id: "blocked", runtimeState: "waiting" }));

    assert.deepEqual(stateOf(view), { id: "blocked", active: true, waiting: true });
  });
});

// The state a source reported is finer than active/waiting: a running session is
// either working or idle, and only the source can tell them apart.
describe("Runtime state", () => {
  it("carries the state the source reported", () => {
    const [view] = viewSessions(sourceOf({ id: "s1", runtimeState: "working" }));

    assert.equal(view.runtimeState, "working");
  });

  it("says inactive when the session is not running", () => {
    const [view] = viewSessions(sourceOf({ id: "s1" }));

    assert.equal(view.runtimeState, "inactive");
    assert.deepEqual(stateOf(view), { id: "s1", active: false, waiting: false });
  });
});
