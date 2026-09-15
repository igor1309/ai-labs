import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { claudeCodeRegistryStates } from "./claude-code-registry.js";
import { claudeCodeSessions, type WorkspaceFacts } from "./claude-code.js";
import { composeClaudeCodeRuntimeStates } from "./compose-claude-code-runtime-states.js";
import { repositoryOf } from "./git-repository.js";
import { sessionLines } from "./session-lines.js";
import { recentSessions, viewSessions } from "./sessions.js";

// Composition root: the only place that reads the machine — where Claude Code
// keeps its files, and what time it is — and hands both to the pure modules.
const claudeDirectory = join(homedir(), ".claude");

// What the file system says about a workspace, which is all the adapter can ask
// for: the transcript only holds the path.
const workspaceFacts: WorkspaceFacts = (workspace) => ({
  onDisk: existsSync(workspace),
  repository: repositoryOf(workspace),
});

// The registry is what tells this machine which sessions are running;
// composition puts its words to the ones the adapter reads.
const runtimeStates = composeClaudeCodeRuntimeStates(
  claudeCodeRegistryStates(join(claudeDirectory, "sessions")),
);

const sessions = viewSessions(
  claudeCodeSessions(join(claudeDirectory, "projects"), runtimeStates, workspaceFacts),
);

for (const line of sessionLines(recentSessions(sessions, { now: new Date(), withinDays: 7 }))) {
  console.log(line);
}
