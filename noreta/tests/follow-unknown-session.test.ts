import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { followSession, type FollowedSession } from "../src/follow.js";
import { changeSignal } from "./change-signal.js";
import { sourceOf } from "./session-source.js";
import { at } from "./time.js";
import { transcriptOf } from "./transcript-source.js";

// Not QA scenarios: what following pushes when the sources do not know the id,
// and how often it pushes.
describe("Following a session the sources do not know", () => {
  it("shows no session and an empty transcript", () => {
    const shown: FollowedSession[] = [];

    followSession(
      sourceOf({ id: "s1", runtimeState: "working" }),
      transcriptOf("s1", [
        { kind: "message", at: at("10:01"), role: "user", text: "start" },
      ]),
      "missing",
      changeSignal().subscribe,
      (followed) => shown.push(followed),
    );

    assert.deepEqual(shown, [{ session: undefined, transcript: [] }]);
  });
});

describe("Following pushes", () => {
  it("shows the session once on opening, before anything changes", () => {
    const shown: FollowedSession[] = [];

    followSession(
      sourceOf({ id: "s1", runtimeState: "working" }),
      transcriptOf("s1", []),
      "s1",
      changeSignal().subscribe,
      (followed) => shown.push(followed),
    );

    assert.equal(shown.length, 1);
  });

  it("shows the session again on every change", () => {
    const changes = changeSignal();
    const shown: FollowedSession[] = [];

    followSession(
      sourceOf({ id: "s1", runtimeState: "working" }),
      transcriptOf("s1", []),
      "s1",
      changes.subscribe,
      (followed) => shown.push(followed),
    );
    changes.fire();
    changes.fire();

    assert.equal(shown.length, 3);
  });

  it("shows nothing more once following is stopped", () => {
    const changes = changeSignal();
    const shown: FollowedSession[] = [];

    const stop = followSession(
      sourceOf({ id: "s1", runtimeState: "working" }),
      transcriptOf("s1", []),
      "s1",
      changes.subscribe,
      (followed) => shown.push(followed),
    );

    assert.equal(typeof stop, "function", "following should hand back a way to stop");

    stop();
    changes.fire();

    assert.equal(shown.length, 1);
  });
});
