import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

// The candidate: an exact revision compared against a base. Resolving it
// pins both ends to commit SHAs, so every input and every piece of evidence
// refers to one immutable candidate.

const exec = promisify(execFile);
const MAX_DIFF_CHARS = 150_000;

export interface Candidate {
  repository: string;
  base: string;
  candidate: string;
  mergeBase: string;
  changedFiles: string[];
  diff: string;
  diffTruncated: boolean;
}

export async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await exec("git", args, { cwd, maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  } catch (error: any) {
    const detail = String(error.stderr ?? error.message).trim();
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }
}

async function resolveCommit(cwd: string, revision: string): Promise<string> {
  return (await git(cwd, ["rev-parse", "--verify", "--quiet", `${revision}^{commit}`]).catch(() => {
    throw new Error(`not a commit: ${revision}`);
  })).trim();
}

export async function defaultBase(cwd: string): Promise<string> {
  for (const candidate of ["origin/HEAD", "origin/main", "origin/trunk", "main", "trunk"]) {
    try {
      await resolveCommit(cwd, candidate);
      return candidate;
    } catch {
      // try the next conventional name
    }
  }
  throw new Error("cannot infer a base revision; pass --base <rev>");
}

export async function resolveCandidate(cwd: string, base: string, candidate: string): Promise<Candidate> {
  const repository = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
  const baseSha = await resolveCommit(repository, base);
  const candidateSha = await resolveCommit(repository, candidate);
  const mergeBase = (await git(repository, ["merge-base", baseSha, candidateSha])).trim();
  const changedFiles = (await git(repository, ["diff", "--name-only", mergeBase, candidateSha]))
    .split("\n")
    .filter((line) => line !== "");
  if (changedFiles.length === 0) throw new Error(`nothing to compare: ${candidate} has no changes since ${base}`);

  const fullDiff = await git(repository, ["diff", mergeBase, candidateSha]);
  const diffTruncated = fullDiff.length > MAX_DIFF_CHARS;
  return {
    repository,
    base: baseSha,
    candidate: candidateSha,
    mergeBase,
    changedFiles,
    diff: diffTruncated ? fullDiff.slice(0, MAX_DIFF_CHARS) : fullDiff,
    diffTruncated,
  };
}

// Inputs a process can require by name when it runs against a candidate.
export function candidateInputs(target: Candidate): Record<string, unknown> {
  const note = target.diffTruncated
    ? `\n[truncated at ${MAX_DIFF_CHARS} characters; run \`git diff ${target.mergeBase} ${target.candidate} -- <path>\` for the rest]`
    : "";
  return {
    base_revision: target.base,
    merge_base: target.mergeBase,
    candidate_revision: target.candidate,
    changed_files: target.changedFiles,
    diff: target.diff + note,
  };
}

// A detached worktree pins the files the agent reads to the candidate
// revision, independent of the caller's checkout and uncommitted changes.
export async function withCandidateWorktree<T>(
  target: Candidate,
  body: (workspace: string) => Promise<T>,
): Promise<T> {
  const parent = await mkdtemp(join(tmpdir(), "agister-candidate-"));
  const workspace = join(parent, "candidate");
  await git(target.repository, ["worktree", "add", "--detach", "--quiet", workspace, target.candidate]);
  try {
    return await body(workspace);
  } finally {
    await git(target.repository, ["worktree", "remove", "--force", workspace]).catch(() => {});
    await rm(parent, { recursive: true, force: true });
  }
}

