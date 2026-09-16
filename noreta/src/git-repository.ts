import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export function repositoryOf(workspace: string): string | undefined {
  if (!existsSync(workspace)) {
    return undefined;
  }

  for (let directory = workspace; ; directory = dirname(directory)) {
    const marker = join(directory, ".git");

    if (existsSync(marker)) {
      return basename(rootOf(directory, marker));
    }

    // The root is its own parent, so this is the last directory to try.
    if (dirname(directory) === directory) {
      return undefined;
    }
  }
}

function rootOf(directory: string, marker: string): string {
  return statSync(marker).isDirectory() ? directory : mainRepositoryOf(marker);
}

const gitdir = "gitdir: ";

// The one line a worktree's `.git` holds points at the administrative directory
// the repository keeps for it, so the repository root is what comes before it.
function mainRepositoryOf(marker: string): string {
  const linked = readFileSync(marker, "utf8").trim().slice(gitdir.length);

  return linked.split(worktreeAdministration)[0];
}

const worktreeAdministration = "/.git/worktrees/";
