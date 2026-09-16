import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ObservedSession } from "../src/claude-code.js";
import {
  claudeCodeSessionSource,
  isActive,
  recentSessionLines,
} from "../src/composition-root.js";
import { openWorkspaceRepositories } from "../src/workspace-repositories.js";
import { claudeDirectoryOf } from "./claude-code-directory.js";
import { userRecord } from "./claude-code-projects.js";
import { livePid } from "./claude-code-registry.js";
import { checkoutDirectory, missingDirectory } from "./git-layouts.js";
import {
  freshMemoryFile,
  holdWriteLock,
  isWriteLocked,
  notADatabase,
  rememberedIn,
  writeProtected,
} from "./memory-files.js";
import { at } from "./time.js";

// Not QA scenarios: how the composition root reads the adapter's records for
// the modules it hands them to.
describe("What the composition root wires together", () => {
  it("reads a session with a runtime state as active", () => {
    assert.equal(isActive({ runtimeState: "idle" }), true);
  });

  it("reads a session without a runtime state as inactive", () => {
    assert.equal(isActive({}), false);
  });

  it("lists recent and running sessions newest first", () => {
    const sevenDaysBeforeTen = at("10:00").getTime() - 7 * 24 * 60 * 60 * 1000;
    const source = () => [
      observedSession({
        id: "seven-days-old",
        workspace: "/seven-days-old",
        lastActivityAt: new Date(sevenDaysBeforeTen),
      }),
      observedSession({
        id: "just-over-seven-days-old",
        workspace: "/just-over-seven-days-old",
        lastActivityAt: new Date(sevenDaysBeforeTen - 1),
      }),
      observedSession({ id: "older", workspace: "/older", lastActivityAt: at("09:00") }),
      observedSession({
        id: "running-long-ago",
        workspace: "/running",
        runtimeState: "working",
        lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      }),
      observedSession({
        id: "forgotten",
        workspace: "/forgotten",
        lastActivityAt: new Date("2026-01-02T00:00:00Z"),
      }),
      observedSession({ id: "newer", workspace: "/newer", lastActivityAt: at("10:00") }),
    ];

    assert.deepEqual(recentSessionLines(source, at("10:00")), [
      "  claude  inactive  -  /newer  2026-09-15T10:00:00.000Z",
      "  claude  inactive  -  /older  2026-09-15T09:00:00.000Z",
      "  claude  inactive  -  /seven-days-old  2026-09-08T10:00:00.000Z",
      "* claude  working  -  /running  2026-01-01T00:00:00.000Z",
    ]);
  });

  it("reads a session's transcript, registration and workspace from the Claude directory", () => {
    const workspace = checkoutDirectory("a-checkout");
    const claudeDirectory = claudeDirectoryOf({
      sessions: [
        {
          id: "live",
          records: [userRecord({ id: "live", workspace, branch: "trunk", at: at("10:00") })],
        },
      ],
      registered: [{ pid: livePid, sessionId: "live", status: "busy" }],
    });

    assert.deepEqual(claudeCodeSessionSource(claudeDirectory, freshMemoryFile())(), [
      {
        id: "live",
        agent: "claude",
        workspace,
        workspaceOnDisk: true,
        repository: "a-checkout",
        branch: "trunk",
        runtimeState: "working",
        lastActivityAt: at("10:00"),
      },
    ]);
  });

  it("remembers the repository of a workspace on disk", () => {
    const workspace = checkoutDirectory("a-checkout");
    const memoryFile = freshMemoryFile();

    claudeCodeSessionSource(claudeDirectoryWith(workspace), memoryFile)();

    assert.equal(openWorkspaceRepositories(memoryFile).recall(workspace), "a-checkout");
  });

  // Every transcript asks again, so a write each time would queue behind any
  // other process writing the file.
  it("lists a remembered workspace without waiting for another writer", async () => {
    const workspace = checkoutDirectory("a-checkout");
    const memoryFile = rememberedIn({ [workspace]: "a-checkout" });
    const otherWriter = await holdWriteLock(memoryFile, 1000);

    claudeCodeSessionSource(claudeDirectoryWith(workspace), memoryFile)();

    assert.equal(isWriteLocked(memoryFile), true);
    await otherWriter.released;
  });

  // Outlasts the memory's five-second wait for the lock.
  it("lists a workspace on disk while another writer holds the memory too long", async () => {
    const workspace = checkoutDirectory("a-checkout");
    const memoryFile = rememberedIn({ "/another-workspace": "another-repository" });
    const otherWriter = await holdWriteLock(memoryFile, 6000);

    const sessions = claudeCodeSessionSource(claudeDirectoryWith(workspace), memoryFile)();
    await otherWriter.released;

    assert.deepEqual(sessions.map(workspaceOf), [
      { workspaceOnDisk: true, repository: "a-checkout" },
    ]);
    assert.equal(openWorkspaceRepositories(memoryFile).recall(workspace), undefined);
  });

  it("lists a workspace on disk while the memory refuses to be written", () => {
    const workspace = checkoutDirectory("a-checkout");
    const memoryFile = writeProtected(
      rememberedIn({ "/another-workspace": "another-repository" }),
    );

    assert.deepEqual(
      claudeCodeSessionSource(claudeDirectoryWith(workspace), memoryFile)().map(workspaceOf),
      [{ workspaceOnDisk: true, repository: "a-checkout" }],
    );
    assert.equal(openWorkspaceRepositories(memoryFile).recall(workspace), undefined);
  });

  it("lists a workspace on disk while the memory cannot be opened", () => {
    const workspace = checkoutDirectory("a-checkout");

    assert.deepEqual(
      claudeCodeSessionSource(claudeDirectoryWith(workspace), notADatabase())().map(workspaceOf),
      [{ workspaceOnDisk: true, repository: "a-checkout" }],
    );
  });

  it("reports the repository remembered for a workspace no longer on disk", () => {
    const workspace = missingDirectory();
    const memoryFile = rememberedIn({ [workspace]: "a-checkout" });

    assert.deepEqual(
      claudeCodeSessionSource(claudeDirectoryWith(workspace), memoryFile)().map(workspaceOf),
      [{ workspaceOnDisk: false, repository: "a-checkout" }],
    );
  });
});

// A Claude directory holding one session, not running, in the given workspace.
function claudeDirectoryWith(workspace: string): string {
  return claudeDirectoryOf({
    sessions: [
      {
        id: "session",
        records: [userRecord({ id: "session", workspace, branch: "trunk", at: at("10:00") })],
      },
    ],
    registered: [],
  });
}

function workspaceOf(session: ObservedSession): {
  workspaceOnDisk: boolean;
  repository: string | undefined;
} {
  return { workspaceOnDisk: session.workspaceOnDisk, repository: session.repository };
}

// A record the adapter could report, naming only what a test is about.
function observedSession(
  session: Pick<ObservedSession, "id" | "workspace" | "lastActivityAt"> &
    Partial<ObservedSession>,
): ObservedSession {
  return { agent: "claude", workspaceOnDisk: true, ...session };
}
