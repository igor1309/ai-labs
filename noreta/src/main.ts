import { homedir } from "node:os";
import { join } from "node:path";

import { claudeCodeSessionSource, recentSessionLines } from "./composition-root.js";

const claudeDirectory = join(homedir(), ".claude");

for (const line of recentSessionLines(claudeCodeSessionSource(claudeDirectory), new Date())) {
  console.log(line);
}
