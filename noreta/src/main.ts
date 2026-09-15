import { homedir } from "node:os";
import { join } from "node:path";

import { claudeCodeRuntimeStates } from "./claude-code-registry.js";
import { claudeCodeSessions } from "./claude-code.js";
import { sessionLines } from "./session-lines.js";
import { recentSessions, viewSessions } from "./sessions.js";

// Composition root: the only place that reads the machine — where Claude Code
// keeps its files, and what time it is — and hands both to the pure modules.
const claudeDirectory = join(homedir(), ".claude");

const sessions = viewSessions(
  claudeCodeSessions(
    join(claudeDirectory, "projects"),
    claudeCodeRuntimeStates(join(claudeDirectory, "sessions")),
  ),
);

for (const line of sessionLines(recentSessions(sessions, { now: new Date(), withinDays: 7 }))) {
  console.log(line);
}
