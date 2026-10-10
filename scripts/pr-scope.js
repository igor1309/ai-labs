#!/usr/bin/env node
// A pull request that changes Agister (its code and home settings under
// agister/, or this repository's settings under the root .agister/) changes
// no other project: a project's change cannot carry an Agister change in
// with it (LAB-163). A project's own settings layer, <project>/.agister/,
// may change beside Agister, as when Agister migrates every layer.
//
// Usage: node scripts/pr-scope.js <base-ref>
// Compares <base-ref>...HEAD and exits 1, naming both sides, on a mix.

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Top-level directories every project shares: a change there is no project's.
// gokit is the Go library Agister and the other Go projects build on.
const shared = new Set([".claude", ".codex", ".github", "backlog", "docs", "gokit", "prompts", "research", "scripts"]);

export function scopeViolation(files) {
  const agister = [];
  const projects = [];
  for (const file of files) {
    const [top, second] = file.split("/");
    if (top === "agister" || top === ".agister") agister.push(file);
    else if (second === undefined || shared.has(top) || second === ".agister") continue;
    else projects.push(file);
  }
  if (agister.length === 0 || projects.length === 0) return null;
  return { agister, projects };
}

function main(argv) {
  const base = argv[0];
  if (!base) {
    process.stderr.write("usage: node scripts/pr-scope.js <base-ref>\n");
    return 2;
  }
  const out = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { encoding: "utf8" });
  const violation = scopeViolation(out.split("\n").filter(Boolean));
  if (!violation) return 0;
  process.stderr.write(
    "pr-scope: this pull request changes Agister and another project; split it.\n" +
      `Agister:\n${violation.agister.map((f) => `  ${f}\n`).join("")}` +
      `Other projects:\n${violation.projects.map((f) => `  ${f}\n`).join("")}`,
  );
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
