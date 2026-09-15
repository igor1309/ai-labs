import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { viewSessions } from "../src/sessions.js";
import { changingSource, sourceOf, stateOf } from "./session-source.js";

describe("Feature: See active sessions", () => {
  describe("Rule: A session with a live runtime is active", () => {
    it("A working session is active", () => {
      const source = sourceOf({ id: "s1", runtimeState: "working" });

      assert.deepEqual(viewSessions(source).map(stateOf), [
        { id: "s1", active: true, waiting: false },
      ]);
    });

    it("A session waiting for input is visible as waiting", () => {
      const source = sourceOf({ id: "s1", runtimeState: "waiting-for-input" });

      assert.deepEqual(viewSessions(source).map(stateOf), [
        { id: "s1", active: true, waiting: true },
      ]);
    });

    it("A session waiting for approval is visible as waiting", () => {
      const source = sourceOf({ id: "s1", runtimeState: "waiting-for-approval" });

      assert.deepEqual(viewSessions(source).map(stateOf), [
        { id: "s1", active: true, waiting: true },
      ]);
    });

    it("An idle session is active", () => {
      const source = sourceOf({ id: "s1", runtimeState: "idle" });

      assert.deepEqual(viewSessions(source).map(stateOf), [
        { id: "s1", active: true, waiting: false },
      ]);
    });
  });

  describe("Rule: A session without a live runtime is inactive", () => {
    it("A runtime terminates", () => {
      const source = changingSource({ id: "s1", runtimeState: "working" });
      assert.deepEqual(viewSessions(source.read).map(stateOf), [
        { id: "s1", active: true, waiting: false },
      ]);

      source.replaceWith({ id: "s1" });

      assert.deepEqual(viewSessions(source.read).map(stateOf), [
        { id: "s1", active: false, waiting: false },
      ]);
    });
  });

  describe("Rule: Sessions are discovered independently of how they were started", () => {
    it("A session starts outside Noreta", () => {
      const source = changingSource();
      assert.deepEqual(viewSessions(source.read).map(stateOf), []);

      source.replaceWith({ id: "started-elsewhere", runtimeState: "working" });

      assert.deepEqual(viewSessions(source.read).map(stateOf), [
        { id: "started-elsewhere", active: true, waiting: false },
      ]);
    });

    it("Noreta starts after the agent", () => {
      const source = sourceOf({ id: "already-running", runtimeState: "working" });

      assert.deepEqual(viewSessions(source).map(stateOf), [
        { id: "already-running", active: true, waiting: false },
      ]);
    });
  });
});
