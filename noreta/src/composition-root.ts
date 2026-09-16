import { existsSync } from "node:fs";
import { join } from "node:path";

import { claudeCodeRegistryStates } from "./claude-code-registry.js";
import {
  claudeCodeSessions,
  type ObservedSession,
  type SessionSource,
  type WorkspaceFacts,
} from "./claude-code.js";
import { composeClaudeCodeRuntimeStates } from "./compose-claude-code-runtime-states.js";
import { repositoryOf } from "./git-repository.js";
import { newestFirst } from "./ordering.js";
import { sessionLines } from "./session-lines.js";
import { recentSessions } from "./sessions.js";
import {
  openWorkspaceRepositories,
  type WorkspaceRepositories,
} from "./workspace-repositories.js";

function workspaceFactsFrom(memory: WorkspaceRepositories): WorkspaceFacts {
  return (workspace) => {
    const onDisk = existsSync(workspace);
    const repository = onDisk ? repositoryOf(workspace) : memory.recall(workspace);

    if (onDisk && repository !== undefined && memory.recall(workspace) !== repository) {
      rememberIfTheMemoryTakesIt(memory, workspace, repository);
    }

    return {
      onDisk,
      ...(repository === undefined ? {} : { repository }),
    };
  };
}

// Reached with the repository already read off the disk, so whatever turns the
// write away — a lock another process held past the wait, permissions on the
// file, no room left on the volume — leaves the reported facts unchanged.
function rememberIfTheMemoryTakesIt(
  memory: WorkspaceRepositories,
  workspace: string,
  repository: string,
): void {
  try {
    memory.remember(workspace, repository);
  } catch {
    // Nothing to do: the next listing asks the disk again.
  }
}

// Opening can fail before any session is read — a directory the user may not
// create, a file holding something else — and none of the reported facts come
// from here when the workspace is on disk.
function memoryAt(file: string): WorkspaceRepositories {
  try {
    return openWorkspaceRepositories(file);
  } catch {
    return forgetsEverything;
  }
}

const forgetsEverything: WorkspaceRepositories = {
  remember() {},
  recall() {
    return undefined;
  },
  close() {},
};

export function claudeCodeSessionSource(
  claudeDirectory: string,
  memoryFile: string,
): SessionSource {
  const runtimeStates = composeClaudeCodeRuntimeStates(
    claudeCodeRegistryStates(join(claudeDirectory, "sessions")),
  );

  return claudeCodeSessions(
    join(claudeDirectory, "projects"),
    runtimeStates,
    workspaceFactsFrom(memoryAt(memoryFile)),
  );
}

export function isActive(session: Pick<ObservedSession, "runtimeState">): boolean {
  return session.runtimeState !== undefined;
}

const recentWithinDays = 7;

// The default view's lines. Newest first is this list's order, not the
// source's: the adapter reads files in whatever order the directory gives them.
export function recentSessionLines(readSessions: SessionSource, now: Date): string[] {
  const sessions = newestFirst(readSessions());

  return sessionLines(recentSessions(sessions, { now, withinDays: recentWithinDays }, isActive));
}
