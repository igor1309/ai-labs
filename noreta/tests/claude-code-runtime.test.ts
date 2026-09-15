import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { claudeCodeRegistryStates } from "../src/claude-code-registry.js";
import {
  absentRegistryDirectory,
  deadPid,
  livePid,
  otherLivePid,
  register,
  registerHalfWritten,
  registryDirectoryOf,
} from "./claude-code-registry.js";

// Not QA scenarios: what the registry read makes of Claude Code's registry of
// running sessions, `~/.claude/sessions/<pid>.json`.
describe("What Claude Code's registry says about a running session", () => {
  it("reports a busy session as working", () => {
    const registry = registryDirectoryOf({
      pid: livePid,
      sessionId: "busy-one",
      status: "busy",
    });

    assert.equal(claudeCodeRegistryStates(registry)()("busy-one"), "working");
  });

  it("reports an idle session as idle", () => {
    const registry = registryDirectoryOf({
      pid: livePid,
      sessionId: "idle-one",
      status: "idle",
    });

    assert.equal(claudeCodeRegistryStates(registry)()("idle-one"), "idle");
  });

  // The file outlives the process it names when a session dies without cleaning
  // up, and a registration nobody is behind is not a running session.
  it("ignores a registration whose process is gone", () => {
    const registry = registryDirectoryOf({
      pid: deadPid,
      sessionId: "departed",
      status: "busy",
    });

    assert.equal(claudeCodeRegistryStates(registry)()("departed"), undefined);
  });

  // `waitingFor` is a free-text detail with four known literals, of which
  // "dialog open" covers everything from a permission prompt to a model
  // fallback, so it cannot say whether the session wants input or approval.
  it("reports a waiting session as waiting, without a kind", () => {
    const registry = registryDirectoryOf({
      pid: livePid,
      sessionId: "blocked",
      status: "waiting",
      waitingFor: "input needed",
    });

    assert.equal(claudeCodeRegistryStates(registry)()("blocked"), "waiting");
  });

  // The SDK-driven sessions register without ever writing a status. Their
  // process is alive, so the session is running; nothing says it is busy or
  // blocked.
  it("reports a registration without a status as idle", () => {
    const registry = registryDirectoryOf({ pid: livePid, sessionId: "quiet" });

    assert.equal(claudeCodeRegistryStates(registry)()("quiet"), "idle");
  });

  // Two live processes can register the same session, and nothing says which is
  // the real one. Report the busiest: over-reporting that a session wants
  // attention costs a glance, under-reporting it costs a stall.
  it("reports the busiest of two registrations of one session", () => {
    const registry = registryDirectoryOf(
      { pid: livePid, sessionId: "twice", status: "idle" },
      { pid: otherLivePid, sessionId: "twice", status: "busy" },
    );

    assert.equal(claudeCodeRegistryStates(registry)()("twice"), "working");
  });

  // Sessions start and stop while Noreta is held open, so the registry is read
  // for each answer rather than once when the read was made.
  it("reports a session that registered after the read was made", () => {
    const registry = registryDirectoryOf();
    const registryStates = claudeCodeRegistryStates(registry);
    assert.equal(registryStates()("late"), undefined);

    register(registry, { pid: livePid, sessionId: "late", status: "busy" });

    assert.equal(registryStates()("late"), "working");
  });

  // Every registration is written by a live process, so a snapshot can catch one
  // half written. One unreadable file is not a reason to lose every other
  // session on the machine.
  it("reports a session alongside a half-written registration", () => {
    const registry = registryDirectoryOf({
      pid: livePid,
      sessionId: "readable",
      status: "busy",
    });

    registerHalfWritten(registry, otherLivePid);

    assert.equal(claudeCodeRegistryStates(registry)()("readable"), "working");
  });

  // Claude Code makes the registry when a session first registers, so a machine
  // that has never run one has no registry to read. Nothing is running there.
  it("reports no session when the registry has never been written", () => {
    const registry = absentRegistryDirectory();

    assert.equal(claudeCodeRegistryStates(registry)()("anyone"), undefined);
  });
});
