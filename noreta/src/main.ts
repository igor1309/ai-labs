import { homedir } from "node:os";
import { join } from "node:path";

import { claudeCodeSessionSource, recentSessionLines } from "./composition-root.js";

// Entry point: the only place that reads the machine — where Claude Code keeps
// its files, and what time it is — and writes to the terminal.
const claudeDirectory = join(homedir(), ".claude");

for (const line of recentSessionLines(claudeCodeSessionSource(claudeDirectory), new Date())) {
  console.log(line);
}
