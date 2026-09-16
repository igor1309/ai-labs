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

const workspaceFacts: WorkspaceFacts = (workspace) => {
  const onDisk = existsSync(workspace);
  const repository = onDisk ? repositoryOf(workspace) : undefined;

  return {
    onDisk,
    ...(repository === undefined ? {} : { repository }),
  };
};

export function claudeCodeSessionSource(claudeDirectory: string): SessionSource {
  const runtimeStates = composeClaudeCodeRuntimeStates(
    claudeCodeRegistryStates(join(claudeDirectory, "sessions")),
  );

  return claudeCodeSessions(join(claudeDirectory, "projects"), runtimeStates, workspaceFacts);
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
