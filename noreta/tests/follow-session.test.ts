import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { followSession, type FollowedSession } from "../src/follow.js";
import type { TranscriptEntry } from "../src/transcript.js";
import { changingSource, stateOf } from "./session-source.js";
import { at } from "./time.js";
import { changingTranscript, describeEntry } from "./transcript-source.js";

describe("Feature: Follow an active session", () => {
  describe("Rule: An open transcript reflects new activity", () => {
    it("The agent produces a message", () => {
      const sessions = changingSource({ id: "s1", runtimeState: "working" });
      const transcripts = changingTranscript("s1", [
        { kind: "message", at: at("10:01"), role: "user", text: "start" },
      ]);
      const follow = followSession(sessions.read, transcripts.read, "s1");
      assert.deepEqual(follow().transcript.map(describeEntry), ["start"]);

      transcripts.append({
        kind: "message",
        at: at("10:02"),
        role: "agent",
        text: "working on it",
      });

      assert.deepEqual(follow().transcript.map(describeEntry), ["start", "working on it"]);
    });

    it("An active session starts waiting for input", () => {
      const sessions = changingSource({ id: "s1", runtimeState: "working" });
      const follow = followSession(sessions.read, noTranscript, "s1");
      assert.deepEqual(followedState(follow), {
        id: "s1",
        active: true,
        waiting: false,
      });

      sessions.replaceWith({ id: "s1", runtimeState: "waiting-for-input" });

      assert.deepEqual(followedState(follow), {
        id: "s1",
        active: true,
        waiting: true,
      });
    });

    it("An active session starts waiting for approval", () => {
      const sessions = changingSource({ id: "s1", runtimeState: "working" });
      const follow = followSession(sessions.read, noTranscript, "s1");
      assert.deepEqual(followedState(follow), {
        id: "s1",
        active: true,
        waiting: false,
      });

      sessions.replaceWith({ id: "s1", runtimeState: "waiting-for-approval" });

      assert.deepEqual(followedState(follow), {
        id: "s1",
        active: true,
        waiting: true,
      });
    });

    it("The runtime becomes inactive", () => {
      const sessions = changingSource({ id: "s1", runtimeState: "working" });
      const follow = followSession(sessions.read, noTranscript, "s1");
      assert.equal(followedState(follow).active, true);

      sessions.replaceWith({ id: "s1" });

      assert.deepEqual(followedState(follow), {
        id: "s1",
        active: false,
        waiting: false,
      });
    });
  });
});

function followedState(follow: () => FollowedSession) {
  const { session } = follow();

  assert.ok(session, "the followed session should be present");

  return stateOf(session);
}

function noTranscript(): TranscriptEntry[] {
  return [];
}
