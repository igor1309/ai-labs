import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The two shapes git leaves at the top of a working tree, written by hand: what
// is read is the layout, so a real `git init` would only make the tests slower.

// A plain checkout, whose `.git` is a directory.
export function checkoutDirectory(name: string): string {
  const root = join(freshDirectory(), name);

  mkdirSync(join(root, ".git"), { recursive: true });

  return root;
}

// A linked worktree, whose `.git` is a file naming the administrative directory
// its repository keeps for it. The repository itself need not exist: the line is
// all that says where the worktree belongs.
export function worktreeDirectory(name: string, repository: string): string {
  const worktree = join(freshDirectory(), name);

  mkdirSync(worktree);
  writeFileSync(join(worktree, ".git"), `gitdir: ${repository}/.git/worktrees/${name}\n`);

  return worktree;
}

// A directory below the root of a checkout, as deep as it is given.
export function directoryIn(root: string, ...segments: string[]): string {
  const directory = join(root, ...segments);

  mkdirSync(directory, { recursive: true });

  return directory;
}

// A directory with no repository above it: the temporary directory is outside
// every checkout on the machine.
export function unversionedDirectory(): string {
  return freshDirectory();
}

function freshDirectory(): string {
  return mkdtempSync(join(tmpdir(), "noreta-git-"));
}
