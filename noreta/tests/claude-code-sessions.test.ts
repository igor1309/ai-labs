import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { claudeCodeSessions, type RuntimeStates } from "../src/claude-code.js";
import {
  appendPartialRecord,
  existingDirectory,
  projectsDirectoryOf,
  type TranscriptRecord,
  userRecord,
} from "./claude-code-projects.js";
import { at } from "./time.js";

// Nothing in these files is running: the registry is a separate source, tested
// on its own in claude-code-runtime.test.ts.
const notRunning: RuntimeStates = () => undefined;

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
    const running: RuntimeStates = (id) => (id === "running" ? "working" : undefined);

    assert.deepEqual(
      claudeCodeSessions(projects, running)().map((session) => session.runtimeState),
      ["working"],
    );
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
