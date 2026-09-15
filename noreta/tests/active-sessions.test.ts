import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { viewSessions } from "../src/sessions.js";
import { changingSource, sourceOf } from "./session-source.js";

describe("Feature: See active sessions", () => {
  describe("Rule: A session with a live runtime is active", () => {
    it("A working session is active", () => {
      const source = sourceOf({ id: "s1", runtimeState: "working" });

      assert.deepEqual(viewSessions(source), [
        { id: "s1", active: true, waiting: false },
      ]);
    });

    it("A session waiting for input is visible as waiting", () => {
      const source = sourceOf({ id: "s1", runtimeState: "waiting-for-input" });

      assert.deepEqual(viewSessions(source), [
        { id: "s1", active: true, waiting: true },
      ]);
    });

    it("A session waiting for approval is visible as waiting", () => {
      const source = sourceOf({ id: "s1", runtimeState: "waiting-for-approval" });

      assert.deepEqual(viewSessions(source), [
        { id: "s1", active: true, waiting: true },
      ]);
    });

    it("An idle session is active", () => {
      const source = sourceOf({ id: "s1", runtimeState: "idle" });

      assert.deepEqual(viewSessions(source), [
        { id: "s1", active: true, waiting: false },
      ]);
    });
  });

  describe("Rule: A session without a live runtime is inactive", () => {
    it("A runtime terminates", () => {
      const source = changingSource({ id: "s1", runtimeState: "working" });
      assert.deepEqual(viewSessions(source.read), [
        { id: "s1", active: true, waiting: false },
      ]);

      source.replaceWith({ id: "s1" });

      assert.deepEqual(viewSessions(source.read), [
        { id: "s1", active: false, waiting: false },
      ]);
    });
  });

  describe("Rule: Sessions are discovered independently of how they were started", () => {
    it("A session starts outside Noreta", () => {
      const source = changingSource();
      assert.deepEqual(viewSessions(source.read), []);

      source.replaceWith({ id: "started-elsewhere", runtimeState: "working" });

      assert.deepEqual(viewSessions(source.read), [
        { id: "started-elsewhere", active: true, waiting: false },
      ]);
    });

    it("Noreta starts after the agent", () => {
      const source = changingSource({ id: "already-running", runtimeState: "working" });
      assert.equal(source.readCount(), 0, "the session exists before Noreta observes anything");

      assert.deepEqual(viewSessions(source.read), [
        { id: "already-running", active: true, waiting: false },
      ]);
      assert.equal(source.readCount(), 1);
    });
  });
});
