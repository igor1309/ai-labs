import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { ExecutionPolicy, RuntimeCapabilities } from "./runtime.js";

// The `review` process: one independent, read-only review of an exact
// candidate revision. The process owns the instruction, the input and output
// contract and the execution policy; the agent profile only says which runtime
// and model perform it.

const exec = promisify(execFile);
const MAX_DIFF_CHARS = 150_000;

export const REVIEW_TIMEOUT_MS = 20 * 60_000;

// Read-only review. A runtime with a tool surface gets read tools plus git
// inspection; a sandboxed runtime relies on its read-only OS sandbox, which
// still lets the reviewer run read-only commands.
export function reviewPolicy(capabilities: RuntimeCapabilities, timeoutMs: number): ExecutionPolicy {
  const policy: ExecutionPolicy = {
    workspace: "read-only",
    isolateConfig: true,
    timeoutMs: Math.min(timeoutMs, REVIEW_TIMEOUT_MS),
  };
  if (capabilities.toolSurface) {
    policy.tools = {
      expose: ["Read", "Grep", "Glob", "Bash"],
      allow: ["Read", "Grep", "Glob", "Bash(git diff:*)", "Bash(git log:*)", "Bash(git show:*)"],
    };
  }
  return policy;
}

export const SEVERITIES = ["blocker", "major", "minor", "nit"] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface Finding {
  severity: Severity;
  file: string;
  line?: number;
  title: string;
  detail: string;
}

export interface ReviewResult {
  verdict: "approve" | "request_changes";
  summary: string;
  findings: Finding[];
}

// Strict-mode compatible: every property is required (Codex/OpenAI structured
// outputs reject optional properties), so an unknown line is `null`.
export const REVIEW_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "summary", "findings"],
  properties: {
    verdict: { type: "string", enum: ["approve", "request_changes"] },
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "file", "line", "title", "detail"],
        properties: {
          severity: { type: "string", enum: [...SEVERITIES] },
          file: { type: "string" },
          line: { type: ["integer", "null"] },
          title: { type: "string" },
          detail: { type: "string" },
        },
      },
    },
  },
} as const;

export const REVIEW_INSTRUCTION = `You are an independent code reviewer. Review the exact candidate revision against its base adversarially.
Report material correctness, safety, contract and maintainability findings. Do not invent problems to fill the list, and do not report style preferences as blockers.
Severity: blocker = must not merge; major = real defect or risk that should be fixed; minor = worth fixing; nit = optional polish.
Use verdict "request_changes" when there is any blocker or major finding, otherwise "approve".
You are working in a read-only checkout of the candidate. Do not attempt to modify files.
Return the result through the structured output tool.`;

export interface ReviewTarget {
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

export async function resolveReviewTarget(cwd: string, base: string, candidate: string): Promise<ReviewTarget> {
  const repository = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
  const baseSha = await resolveCommit(repository, base);
  const candidateSha = await resolveCommit(repository, candidate);
  const mergeBase = (await git(repository, ["merge-base", baseSha, candidateSha])).trim();
  const changedFiles = (await git(repository, ["diff", "--name-only", mergeBase, candidateSha]))
    .split("\n")
    .filter((line) => line !== "");
  if (changedFiles.length === 0) throw new Error(`nothing to review: ${candidate} has no changes since ${base}`);

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

export function reviewPrompt(target: ReviewTarget): string {
  const truncation = target.diffTruncated
    ? `\nThe diff below is truncated at ${MAX_DIFF_CHARS} characters. Use \`git diff ${target.mergeBase} ${target.candidate} -- <path>\` for the rest.\n`
    : "";
  return [
    `Base revision: ${target.base}`,
    `Merge base: ${target.mergeBase}`,
    `Candidate revision: ${target.candidate} (checked out in the working directory)`,
    "",
    "Changed files:",
    ...target.changedFiles.map((file) => `- ${file}`),
    truncation,
    "Diff:",
    "```diff",
    target.diff,
    "```",
  ].join("\n");
}

// A detached worktree pins the files the reviewer reads to the candidate
// revision, independent of the caller's checkout and uncommitted changes.
export async function withCandidateWorktree<T>(
  target: ReviewTarget,
  body: (workspace: string) => Promise<T>,
): Promise<T> {
  const parent = await mkdtemp(join(tmpdir(), "agister-review-"));
  const workspace = join(parent, "candidate");
  await git(target.repository, ["worktree", "add", "--detach", "--quiet", workspace, target.candidate]);
  try {
    return await body(workspace);
  } finally {
    await git(target.repository, ["worktree", "remove", "--force", workspace]).catch(() => {});
    await rm(parent, { recursive: true, force: true });
  }
}

export function validateReviewResult(value: unknown): ReviewResult {
  const fail = (message: string): never => {
    throw new Error(`invalid review output: ${message}`);
  };
  if (typeof value !== "object" || value === null) fail("not an object");
  const record = value as Record<string, unknown>;
  if (record["verdict"] !== "approve" && record["verdict"] !== "request_changes") fail("verdict");
  if (typeof record["summary"] !== "string") fail("summary");
  if (!Array.isArray(record["findings"])) fail("findings");

  const findings = (record["findings"] as unknown[]).map((item, index): Finding => {
    const finding = (typeof item === "object" && item !== null ? item : fail(`findings[${index}]`)) as Record<string, unknown>;
    if (!(SEVERITIES as readonly unknown[]).includes(finding["severity"])) fail(`findings[${index}].severity`);
    for (const key of ["file", "title", "detail"]) {
      if (typeof finding[key] !== "string") fail(`findings[${index}].${key}`);
    }
    const line = finding["line"] ?? undefined;
    if (line !== undefined && (!Number.isInteger(line) || (line as number) < 1)) fail(`findings[${index}].line`);
    const result: Finding = {
      severity: finding["severity"] as Severity,
      file: finding["file"] as string,
      title: finding["title"] as string,
      detail: finding["detail"] as string,
    };
    if (line !== undefined) result.line = line as number;
    return result;
  });

  return { verdict: record["verdict"] as ReviewResult["verdict"], summary: record["summary"] as string, findings };
}

export function formatReview(review: ReviewResult): string {
  const order = (severity: Severity) => SEVERITIES.indexOf(severity);
  const findings = [...review.findings].sort((a, b) => order(a.severity) - order(b.severity));
  const lines = [`Verdict: ${review.verdict}`, "", review.summary.trim()];
  if (findings.length === 0) {
    lines.push("", "No findings.");
  }
  for (const finding of findings) {
    const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
    lines.push("", `[${finding.severity}] ${location} — ${finding.title}`, indent(finding.detail.trim()));
  }
  return lines.join("\n");
}

function indent(text: string): string {
  return text.split("\n").map((line) => `  ${line}`).join("\n");
}
