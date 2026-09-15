import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { claudeCodeSessions } from "../src/claude-code.js";
import {
  appendPartialRecord,
  existingDirectory,
  projectsDirectoryOf,
  userRecord,
} from "./claude-code-projects.js";
import { at } from "./time.js";

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

    assert.deepEqual(claudeCodeSessions(projects)(), [
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
      claudeCodeSessions(projects)().map(({ branch, lastActivityAt }) => ({
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
      claudeCodeSessions(projects)().map((session) => session.workspaceOnDisk),
      [true],
    );
  });

  it("skips a transcript that never says where it is working", () => {
    const projects = projectsDirectoryOf(
      { id: "unplaced", records: [{ type: "mode", mode: "normal", sessionId: "unplaced" }] },
      { id: "placed", records: [userRecord({ id: "placed", at: at("10:00") })] },
    );

    assert.deepEqual(
      claudeCodeSessions(projects)().map((session) => session.id),
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
      claudeCodeSessions(projects)().map((session) => session.id),
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

    assert.deepEqual(claudeCodeSessions(projects)().map((session) => session.branch), [
      undefined,
    ]);
  });
});
