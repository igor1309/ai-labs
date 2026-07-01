// R8 ancestry guard: the public repo's fetched HEAD must descend from the last
// release tag, so publication never lands on rewritten/forced history.
// Used by the publish workflow (`node publish-guard.mjs <ancestor> <head>`), which
// exits non-zero to reject a non-descendant.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function isDescendant({ ancestor, head, cwd }) {
  const result = spawnSync("git", ["merge-base", "--is-ancestor", ancestor, head], { cwd });
  return result.status === 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [ancestor, head] = process.argv.slice(2);
  process.exit(isDescendant({ ancestor, head, cwd: process.cwd() }) ? 0 : 1);
}
