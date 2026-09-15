import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

// Which repository a directory belongs to, answered by git's own layout on disk.
// Nothing an agent records can say it: a worktree's repository is somewhere else
// entirely, and only the file system knows where.
export function repositoryOf(workspace: string): string | undefined {
  // A directory that is gone cannot say where it belonged — its path is all a
  // deleted worktree leaves behind.
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

// A plain checkout keeps a `.git` directory and is its own root; a linked
// worktree keeps a `.git` file naming the repository that holds it.
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
