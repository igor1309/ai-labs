import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { followSession, type FollowedSession } from "../src/follow.js";
import { changeSignal } from "./change-signal.js";
import { changingSource, type ScenarioSession, stateOf } from "./session-source.js";
import { at } from "./time.js";
import {
  changingTranscript,
  describeEntry,
  type ScenarioEntry,
  type ScenarioTranscript,
} from "./transcript-source.js";

describe("Feature: Follow an active session", () => {
  describe("Rule: An open transcript reflects new activity", () => {
    it("The agent produces a message", () => {
      const transcripts = changingTranscript("s1", [
        { kind: "message", at: at("10:01"), role: "user", text: "start" },
      ]);
      const viewing = view({ id: "s1", runtimeState: "working" }, transcripts.read);
      assert.deepEqual(viewing.shown().transcript.map(describeEntry), ["start"]);

      transcripts.append({
        kind: "message",
        at: at("10:02"),
        role: "agent",
        text: "working on it",
      });
      viewing.activityHappens();

      assert.deepEqual(viewing.shown().transcript.map(describeEntry), [
        "start",
        "working on it",
      ]);
    });

    it("An active session starts waiting for input", () => {
      const viewing = view({ id: "s1", runtimeState: "working" });
      assert.deepEqual(viewing.shownState(), { id: "s1", active: true, waiting: false });

      viewing.runtimeBecomes({ id: "s1", runtimeState: "waiting-for-input" });

      assert.deepEqual(viewing.shownState(), { id: "s1", active: true, waiting: true });
    });

    it("An active session starts waiting for approval", () => {
      const viewing = view({ id: "s1", runtimeState: "working" });
      assert.deepEqual(viewing.shownState(), { id: "s1", active: true, waiting: false });

      viewing.runtimeBecomes({ id: "s1", runtimeState: "waiting-for-approval" });

      assert.deepEqual(viewing.shownState(), { id: "s1", active: true, waiting: true });
    });

    it("The runtime becomes inactive", () => {
      const viewing = view({ id: "s1", runtimeState: "working" });
      assert.equal(viewing.shownState().active, true);

      viewing.runtimeBecomes({ id: "s1" });

      assert.deepEqual(viewing.shownState(), { id: "s1", active: false, waiting: false });
    });
  });
});

type ViewedSession = Parameters<typeof changingSource>[0];

// Opens a session the way a reader would and keeps whatever was last pushed to
// the screen. Nothing here re-reads a source: updates have to arrive on their
// own, which is what the scenarios are about.
function view(session: ViewedSession, transcripts: ScenarioTranscript = noTranscript) {
  const sessions = changingSource(session);
  const changes = changeSignal();
  let onScreen: FollowedSession<ScenarioSession, ScenarioEntry> | undefined;

  followSession(sessions.read, transcripts, session.id, changes.subscribe, (followed) => {
    onScreen = followed;
  });

  const shown = (): FollowedSession<ScenarioSession, ScenarioEntry> => {
    assert.ok(onScreen, "opening a session should show it");

    return onScreen;
  };

  return {
    shown,
    shownState: () => {
      const { session: shownSession } = shown();

      assert.ok(shownSession, "the followed session should be present");

      return stateOf(shownSession);
    },
    activityHappens: changes.fire,
    runtimeBecomes: (next: ViewedSession) => {
      sessions.replaceWith(next);
      changes.fire();
    },
  };
}

function noTranscript(): ScenarioEntry[] {
  return [];
}
