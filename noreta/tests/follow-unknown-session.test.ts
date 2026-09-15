import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { followSession } from "../src/follow.js";
import { sourceOf } from "./session-source.js";
import { at } from "./time.js";
import { transcriptOf } from "./transcript-source.js";

// Not a QA scenario: what following an id the sources do not know yields.
describe("Following a session the sources do not know", () => {
  it("reports no session and an empty transcript", () => {
    const follow = followSession(
      sourceOf({ id: "s1", runtimeState: "working" }),
      transcriptOf("s1", [
        { kind: "message", at: at("10:01"), role: "user", text: "start" },
      ]),
      "missing",
    );

    assert.deepEqual(follow(), { session: undefined, transcript: [] });
  });
});
