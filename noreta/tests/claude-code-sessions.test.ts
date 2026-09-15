import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { claudeCodeRuntimeStates } from "../src/claude-code-registry.js";
import { claudeCodeSessions, type RuntimeStates } from "../src/claude-code.js";
import {
  appendPartialRecord,
  existingDirectory,
  projectsDirectoryOf,
  type TranscriptRecord,
  userRecord,
  writeProject,
} from "./claude-code-projects.js";
import { livePid, register, registryDirectoryOf } from "./claude-code-registry.js";
import { at } from "./time.js";

// Nothing in these files is running: the registry is a separate source, tested
// on its own in claude-code-runtime.test.ts.
const notRunning: RuntimeStates = () => () => undefined;

// Not QA scenarios: what the Claude Code adapter makes of the files on disk.
describe("What the Claude Code adapter discovers", () => {
  it("reads a session's identity, workspace and branch from its transcript", () => {
    const projects = projectsDirectoryOf({
      id: "945458b6",
      records: [
        {
          type: "user",
          sessionId: "945458b6",
          cwd: "/nowhere/product-noreta",
          gitBranch: "product/noreta",
          timestamp: at("13:27").toISOString(),
        },
      ],
    });

    assert.deepEqual(claudeCodeSessions(projects, notRunning)(), [
      {
        id: "945458b6",
        agent: "claude",
        workspace: "/nowhere/product-noreta",
        workspaceOnDisk: false,
        branch: "product/noreta",
        lastActivityAt: at("13:27"),
      },
    ]);
  });

  it("takes its branch and last activity from the newest record", () => {
    const projects = projectsDirectoryOf({
      id: "moved",
      records: [
        userRecord({ id: "moved", branch: "trunk", at: at("09:00") }),
        userRecord({ id: "moved", branch: "feature/noreta", at: at("10:30") }),
      ],
    });

    assert.deepEqual(
      claudeCodeSessions(projects, notRunning)().map(({ branch, lastActivityAt }) => ({
        branch,
        lastActivityAt,
      })),
      [{ branch: "feature/noreta", lastActivityAt: at("10:30") }],
    );
  });

  // A session is started by whatever launched the agent, not by Noreta, so its
  // transcript can appear at any time after the source is made.
  it("discovers a transcript written after the source was made", () => {
    const projects = projectsDirectoryOf();
    const sessions = claudeCodeSessions(projects, notRunning);
    assert.deepEqual(sessions(), []);

    writeProject(projects, "-another-project", {
      id: "started-elsewhere",
      records: [userRecord({ id: "started-elsewhere", at: at("10:00") })],
    });

    assert.deepEqual(
      sessions().map((session) => session.id),
      ["started-elsewhere"],
    );
  });

  it("reports a workspace that still exists as on disk", () => {
    const workspace = existingDirectory();
    const projects = projectsDirectoryOf({
      id: "live",
      records: [userRecord({ id: "live", workspace, at: at("10:00") })],
    });

    assert.deepEqual(
      claudeCodeSessions(projects, notRunning)().map((session) => session.workspaceOnDisk),
      [true],
    );
  });

  it("skips a transcript that never says where it is working", () => {
    const projects = projectsDirectoryOf(
      { id: "unplaced", records: [{ type: "mode", mode: "normal", sessionId: "unplaced" }] },
      { id: "placed", records: [userRecord({ id: "placed", at: at("10:00") })] },
    );

    assert.deepEqual(
      claudeCodeSessions(projects, notRunning)().map((session) => session.id),
      ["placed"],
    );
  });

  it("reads a transcript whose last line is still being written", () => {
    const projects = projectsDirectoryOf({
      id: "busy",
      records: [userRecord({ id: "busy", at: at("10:00") })],
    });

    appendPartialRecord(projects, "busy");

    assert.deepEqual(
      claudeCodeSessions(projects, notRunning)().map((session) => session.id),
      ["busy"],
    );
  });

  // Claude Code writes "HEAD" when the workspace has no branch checked out —
  // it is not in a repository, or its HEAD is detached. Either way it is not a
  // branch name, and a session carrying it has no branch.
  it("has no branch when the transcript says HEAD", () => {
    const projects = projectsDirectoryOf({
      id: "branchless",
      records: [userRecord({ id: "branchless", branch: "HEAD", at: at("10:00") })],
    });

    assert.deepEqual(claudeCodeSessions(projects, notRunning)().map((session) => session.branch), [
      undefined,
    ]);
  });

  it("carries the runtime state of a session that is running", () => {
    const projects = projectsDirectoryOf({
      id: "running",
      records: [userRecord({ id: "running", at: at("10:00") })],
    });
    const running: RuntimeStates = () => (id) => (id === "running" ? "working" : undefined);

    assert.deepEqual(
      claudeCodeSessions(projects, running)().map((session) => session.runtimeState),
      ["working"],
    );
  });

  // Wired to the real registry, because the defect only shows when a source is
  // held across a change on disk: a session that starts after the first read
  // was reported inactive for as long as the source lived.
  it("reports the runtime state the registry holds at each read", () => {
    const projects = projectsDirectoryOf({
      id: "starting",
      records: [userRecord({ id: "starting", at: at("10:00") })],
    });
    const registry = registryDirectoryOf();
    const sessions = claudeCodeSessions(projects, claudeCodeRuntimeStates(registry));
    assert.deepEqual(sessions().map((session) => session.runtimeState), [undefined]);

    register(registry, { pid: livePid, sessionId: "starting", status: "busy" });

    assert.deepEqual(sessions().map((session) => session.runtimeState), ["working"]);
  });

  // Asking per session would scan the registry directory once for every session
  // on the machine, so a read takes one snapshot and asks it about each.
  it("takes one runtime snapshot for a read of several sessions", () => {
    const projects = projectsDirectoryOf(
      { id: "one", records: [userRecord({ id: "one", at: at("10:00") })] },
      { id: "two", records: [userRecord({ id: "two", at: at("10:00") })] },
    );
    let snapshots = 0;
    const counted: RuntimeStates = () => {
      snapshots += 1;

      return () => undefined;
    };

    claudeCodeSessions(projects, counted)();

    assert.equal(snapshots, 1);
  });

  it("finds the newest record at the end of a long transcript", () => {
    const projects = projectsDirectoryOf({
      id: "long",
      records: [
        userRecord({ id: "long", branch: "trunk", at: at("09:00") }),
        ...unplacedRecords(megabyte),
        userRecord({ id: "long", branch: "feature/noreta", at: at("10:30") }),
      ],
    });

    assert.deepEqual(
      claudeCodeSessions(projects, notRunning)().map((session) => session.branch),
      ["feature/noreta"],
    );
  });

  it("finds the context of a long transcript that ends in other records", () => {
    const projects = projectsDirectoryOf({
      id: "trailing",
      records: [
        userRecord({ id: "trailing", branch: "feature/noreta", at: at("10:30") }),
        ...unplacedRecords(megabyte),
      ],
    });

    assert.deepEqual(
      claudeCodeSessions(projects, notRunning)().map((session) => session.branch),
      ["feature/noreta"],
    );
  });
});

const megabyte = 1024 * 1024;

// Records that say nothing about where a session is working, enough of them to
// fill roughly `bytes` — so a transcript can be long without its context moving.
function unplacedRecords(bytes: number): TranscriptRecord[] {
  const record = { type: "attachment", content: "x".repeat(1000) };

  return Array.from({ length: Math.ceil(bytes / 1000) }, () => record);
}
