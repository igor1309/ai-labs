import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readTranscript } from "../src/transcript.js";
import { newestFirst, sessionsOf } from "./session-source.js";
import { at } from "./time.js";
import { describeEntry, transcriptOf } from "./transcript-source.js";

// Edge cases behind "Recent sessions are ordered by last activity". Not QA
// scenarios, so they live outside the scenario-named files.
describe("Ordering by last activity", () => {
  it("keeps valid sessions ordered around an unreadable timestamp", () => {
    const sessions = sessionsOf(
      { id: "old", lastActivityAt: new Date("2026-01-01T00:00:00Z") },
      { id: "unreadable", lastActivityAt: new Date("not a date") },
      { id: "new", lastActivityAt: new Date("2026-09-15T00:00:00Z") },
    );

    assert.deepEqual(
      newestFirst(sessions).map((session) => session.id),
      ["new", "old", "unreadable"],
    );
  });

  it("orders several unreadable timestamps without disturbing the valid ones", () => {
    const sessions = sessionsOf(
      { id: "unreadable-first", lastActivityAt: new Date("nonsense") },
      { id: "dated", lastActivityAt: new Date("2026-05-05T00:00:00Z") },
      { id: "unreadable-second", lastActivityAt: new Date("also nonsense") },
    );

    assert.deepEqual(
      newestFirst(sessions).map((session) => session.id),
      ["dated", "unreadable-first", "unreadable-second"],
    );
  });

  it("keeps source order for sessions sharing a last activity time", () => {
    const sameMoment = new Date("2026-03-03T00:00:00Z");
    const sessions = sessionsOf(
      { id: "first", lastActivityAt: sameMoment },
      { id: "second", lastActivityAt: sameMoment },
    );

    assert.deepEqual(
      newestFirst(sessions).map((session) => session.id),
      ["first", "second"],
    );
  });
});

describe("Ordering a transcript", () => {
  it("keeps valid entries ordered around an unreadable timestamp", () => {
    const source = transcriptOf("s1", [
      { kind: "message", at: at("10:02"), role: "agent", text: "second" },
      { kind: "message", at: new Date("not a date"), role: "agent", text: "unreadable" },
      { kind: "message", at: at("10:01"), role: "user", text: "first" },
    ]);

    assert.deepEqual(
      readTranscript(source, "s1").map(describeEntry),
      ["unreadable", "first", "second"],
    );
  });

  it("returns nothing for a session the source does not know", () => {
    const source = transcriptOf("s1", [
      { kind: "message", at: at("10:01"), role: "user", text: "first" },
    ]);

    assert.deepEqual(readTranscript(source, "other"), []);
  });
});
