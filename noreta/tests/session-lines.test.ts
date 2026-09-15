import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sessionLines } from "../src/session-lines.js";
import { viewSessions } from "../src/sessions.js";
import { sourceOf } from "./session-source.js";
import { at } from "./time.js";

// Not QA scenarios: how a session list reads as plain text.
describe("Session lines", () => {
  it("shows a session's agent, state, branch, workspace and last activity", () => {
    const source = sourceOf({
      id: "s1",
      branch: "main",
      workspace: "/repo",
      lastActivityAt: at("10:00"),
    });

    assert.deepEqual(sessionLines(viewSessions(source)), [
      "  claude  inactive  main  /repo  2026-09-15T10:00:00.000Z",
    ]);
  });

  it("marks an active session and shows it as working", () => {
    const source = sourceOf({
      id: "s1",
      branch: "main",
      workspace: "/repo",
      runtimeState: "working",
      lastActivityAt: at("10:00"),
    });

    assert.deepEqual(sessionLines(viewSessions(source)), [
      "* claude  working  main  /repo  2026-09-15T10:00:00.000Z",
    ]);
  });

  it("shows a running session that is doing nothing as idle", () => {
    const source = sourceOf({
      id: "s1",
      branch: "main",
      workspace: "/repo",
      runtimeState: "idle",
      lastActivityAt: at("10:00"),
    });

    assert.deepEqual(sessionLines(viewSessions(source)), [
      "* claude  idle  main  /repo  2026-09-15T10:00:00.000Z",
    ]);
  });

  it("shows a waiting session as waiting", () => {
    const source = sourceOf({
      id: "s1",
      branch: "main",
      workspace: "/repo",
      runtimeState: "waiting",
      lastActivityAt: at("10:00"),
    });

    assert.deepEqual(sessionLines(viewSessions(source)), [
      "* claude  waiting  main  /repo  2026-09-15T10:00:00.000Z",
    ]);
  });

  it("shows a dash for a session with no branch", () => {
    const source = sourceOf({ id: "s1", workspace: "/tmp", lastActivityAt: at("10:00") });

    assert.deepEqual(sessionLines(viewSessions(source)), [
      "  claude  inactive  -  /tmp  2026-09-15T10:00:00.000Z",
    ]);
  });
});
