import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type WrittenSession, writeProject } from "./claude-code-projects.js";
import { type RegistryEntry, register } from "./claude-code-registry.js";

// Writes a Claude Code directory the way `~/.claude` lays it out — transcripts
// under `projects`, running sessions registered under `sessions` — and returns
// its path.
export function claudeDirectoryOf(contents: {
  sessions: WrittenSession[];
  registered: RegistryEntry[];
}): string {
  const root = mkdtempSync(join(tmpdir(), "noreta-claude-"));
  const projects = join(root, "projects");
  const registry = join(root, "sessions");

  mkdirSync(projects);
  writeProject(projects, "-a-project", ...contents.sessions);
  mkdirSync(registry);
  register(registry, ...contents.registered);

  return root;
}
