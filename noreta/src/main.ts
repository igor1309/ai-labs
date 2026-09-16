import { homedir } from "node:os";
import { join } from "node:path";

import { claudeCodeSessionSource, recentSessionLines } from "./composition-root.js";

const claudeDirectory = join(homedir(), ".claude");
const memoryFile = join(homedir(), ".noreta", "workspace-repositories.sqlite");

for (const line of recentSessionLines(
  claudeCodeSessionSource(claudeDirectory, memoryFile),
  new Date(),
)) {
  console.log(line);
}
