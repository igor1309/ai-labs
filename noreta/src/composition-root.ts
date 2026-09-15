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

// Composition root: where the adapter's records meet the modules that read
// them. It takes where Claude Code keeps its files and what time it is from the
// entry point, which is the only place that asks the machine.

// What the file system says about a workspace, which is all the adapter can ask
// for: the transcript only holds the path.
const workspaceFacts: WorkspaceFacts = (workspace) => ({
  onDisk: existsSync(workspace),
  repository: repositoryOf(workspace),
});

// The sessions Claude Code keeps under `claudeDirectory`: transcripts in
// `projects`, and the registry in `sessions`, which is what tells this machine
// which of them are running; composition puts its words to the ones the adapter
// reads.
export function claudeCodeSessionSource(claudeDirectory: string): SessionSource {
  const runtimeStates = composeClaudeCodeRuntimeStates(
    claudeCodeRegistryStates(join(claudeDirectory, "sessions")),
  );

  return claudeCodeSessions(join(claudeDirectory, "projects"), runtimeStates, workspaceFacts);
}

// Reading the adapter's records for the list, which does not know them: a
// Claude Code session carries a runtime state only while it is running, so
// having one is what running looks like in these records.
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
