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
