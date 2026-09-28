import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { composeAgister } from "../src/composition-root.js";
import { EXIT, main, parseDuration, type Io } from "../src/main.js";

const FAKE_CLAUDE = fileURLToPath(new URL("./fixtures/fake-claude.mjs", import.meta.url));
const FAKE_CODEX = fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url));

interface Captured {
  code: number;
  stdout: string;
  stderr: string;
}

async function agister(cwd: string, argv: string[], stdin = ""): Promise<Captured> {
  let stdout = "";
  let stderr = "";
  const io: Io = {
    cwd,
    env: {},
    stdout: (text) => { stdout += text; },
    stderr: (text) => { stderr += text; },
    stdin: async () => stdin,
  };
  const code = await main(argv, io, composeAgister);
  return { code, stdout, stderr };
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

// A repository with a base commit on main and a candidate commit on a branch.
// The candidate's content carries the fake runtime's scenario marker.
function repository(scenario: string): string {
  const root = mkdtempSync(join(tmpdir(), "agister-test-"));
  git(root, "init", "--quiet", "--initial-branch=main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  writeFileSync(join(root, "a.txt"), "one\n");
  git(root, "add", ".");
  git(root, "commit", "--quiet", "-m", "base");
  git(root, "checkout", "--quiet", "-b", "feature");
  writeFileSync(join(root, "a.txt"), `one\ntwo SCENARIO:${scenario}\n`);
  git(root, "commit", "--quiet", "-am", "candidate");
  return root;
}

async function withReviewer(scenario: string): Promise<string> {
  const root = repository(scenario);
  const created = await agister(root, ["agent", "create", "reviewer", "--model", "sonnet", "--effort", "high", "--command", FAKE_CLAUDE]);
  assert.equal(created.code, EXIT.ok, created.stderr);
  return root;
}

test("agent create writes a profile that agent list reads back", async () => {
  const root = mkdtempSync(join(tmpdir(), "agister-test-"));
  const created = await agister(root, ["agent", "create", "reviewer", "--model", "opus", "--effort", "xhigh"]);
  assert.equal(created.code, EXIT.ok, created.stderr);

  const toml = readFileSync(join(root, ".agister", "agents", "reviewer.toml"), "utf8");
  assert.equal(toml, `schema = "agister.agent/v1alpha1"
name = "reviewer"
runtime = "claude-code"
model = "opus"
effort = "xhigh"
session = "fresh-only"
`);

  const listed = await agister(root, ["agent", "list"]);
  assert.equal(listed.stdout, "reviewer\tclaude-code\topus\txhigh\n");

  const duplicate = await agister(root, ["agent", "create", "reviewer"]);
  assert.equal(duplicate.code, EXIT.runFailed);
  assert.match(duplicate.stderr, /already exists/);
  assert.equal((await agister(root, ["agent", "create", "reviewer", "--force"])).code, EXIT.ok);
});

test("agent create rejects unsupported runtimes and efforts", async () => {
  const root = mkdtempSync(join(tmpdir(), "agister-test-"));
  assert.equal((await agister(root, ["agent", "create", "x", "--runtime", "gemini"])).code, EXIT.usage);
  assert.equal((await agister(root, ["agent", "create", "x", "--effort", "extreme"])).code, EXIT.usage);
  // Effort vocabulary is per runtime.
  assert.equal((await agister(root, ["agent", "create", "x", "--runtime", "codex", "--effort", "max"])).code, EXIT.usage);
  assert.equal((await agister(root, ["agent", "create", "x", "--runtime", "claude-code", "--effort", "minimal"])).code, EXIT.usage);
  assert.equal((await agister(root, ["agent", "create", "Bad_Name"])).code, EXIT.runFailed);
});

test("run executes one ad-hoc turn and records it", async () => {
  const root = await withReviewer("approve");
  const result = await agister(root, ["run", "reviewer", "--quiet"], "What is here?");
  assert.equal(result.code, EXIT.ok, result.stderr);
  assert.equal(result.stdout, "All good.\n");
  assert.match(result.stderr, /: completed \$0\.0123 3\.4s 1 permission denial/);

  const runs = await agister(root, ["runs"]);
  const [id, process, agent, outcome] = runs.stdout.trim().split("\t");
  assert.deepEqual([process, agent, outcome], ["ad-hoc", "reviewer", "completed"]);

  const directory = join(root, ".agister", "runs", id!);
  const record = JSON.parse(readFileSync(join(directory, "run.json"), "utf8"));
  assert.equal(record.result.providerSessionId, record.requestedSessionId);

  const events = readFileSync(join(directory, "events.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(events.map((event) => event.seq), events.map((_, index) => index + 1));
  assert.equal(events[0].kind, "RUN_CREATED");
  assert.equal(events.at(-1).kind, "RUN_FINISHED");

  const init = JSON.parse(readFileSync(join(directory, "provider.jsonl"), "utf8").split("\n")[0]!);
  assert.ok(init.argv.includes("--tools=Read,Grep,Glob"));
  assert.ok(init.argv.includes("--restricted"));
  assert.deepEqual(init.argv.slice(init.argv.indexOf("--model"), init.argv.indexOf("--model") + 2), ["--model", "sonnet"]);
});

test("review approves an exact candidate in a detached worktree", async () => {
  const root = await withReviewer("approve");
  const result = await agister(root, ["review", "--base", "main", "--quiet"]);
  assert.equal(result.code, EXIT.ok, result.stderr);
  assert.match(result.stdout, /^Verdict: approve\n\nLooks fine\.\n\n\[nit\] a\.txt — Wording\n  Consider rewording\.\n$/);

  const [id] = (await agister(root, ["runs"])).stdout.split("\t");
  const record = JSON.parse((await agister(root, ["runs", "show", id!])).stdout);
  assert.equal(record.process, "review");
  assert.equal(record.inputs.candidate, git(root, "rev-parse", "HEAD").trim());
  assert.equal(record.inputs.mergeBase, git(root, "rev-parse", "main").trim());
  assert.deepEqual(record.inputs.changedFiles, ["a.txt"]);
  assert.notEqual(record.workspace, root);
  assert.equal(record.output.verdict, "approve");

  // The reviewer ran inside the candidate worktree, which is cleaned up.
  const init = JSON.parse(readFileSync(join(root, ".agister", "runs", id!, "provider.jsonl"), "utf8").split("\n")[0]!);
  assert.equal(init.cwd, record.workspace);
  assert.ok(!existsSync(record.workspace));
  assert.equal(git(root, "worktree", "list").trim().split("\n").length, 1);
  assert.ok(init.argv.includes("--allowedTools=Read,Grep,Glob,Bash(git diff:*),Bash(git log:*),Bash(git show:*)"));
  assert.ok(init.argv.includes("--json-schema"));
});

test("review exits 1 when changes are requested", async () => {
  const root = await withReviewer("request_changes");
  const result = await agister(root, ["review", "--base", "main", "--quiet"]);
  assert.equal(result.code, EXIT.changesRequested, result.stderr);
  assert.match(result.stdout, /\[major\] a\.txt:2 — Off by one/);
});

test("review fails the process when the output breaks its contract", async () => {
  const root = await withReviewer("invalid_output");
  const result = await agister(root, ["review", "--base", "main", "--quiet"]);
  assert.equal(result.code, EXIT.runFailed);
  assert.match(result.stderr, /failed \(invalid review output: verdict\)/);
  assert.match((await agister(root, ["runs"])).stdout, /\treview\treviewer\tfailed\tinvalid review output/);
});

test("review reports a runtime failure as a failed run", async () => {
  const root = await withReviewer("error_result");
  const result = await agister(root, ["review", "--base", "main", "--quiet"]);
  assert.equal(result.code, EXIT.runFailed);
  assert.match(result.stderr, /failed \(provider_error_during_execution: tool crashed\)/);
});

test("review refuses an empty candidate and a missing agent", async () => {
  const root = await withReviewer("approve");
  const empty = await agister(root, ["review", "--base", "HEAD"]);
  assert.equal(empty.code, EXIT.runFailed);
  assert.match(empty.stderr, /nothing to review/);

  const missing = await agister(root, ["review", "--base", "main", "--agent", "ghost"]);
  assert.match(missing.stderr, /agent not found: ghost/);
  assert.equal((await agister(root, ["runs"])).stdout, "");
});

test("parses durations", () => {
  assert.equal(parseDuration("90s"), 90_000);
  assert.equal(parseDuration("10m"), 600_000);
  assert.equal(parseDuration("250ms"), 250);
  assert.equal(parseDuration("5"), 5_000);
  assert.throws(() => parseDuration("soon"), /invalid duration/);
});

test("review with a Codex agent: same process, different runtime", async () => {
  const root = repository("request_changes");
  const created = await agister(root, ["agent", "create", "codex-reviewer", "--runtime", "codex", "--model", "gpt-5.5", "--effort", "xhigh", "--command", FAKE_CODEX]);
  assert.equal(created.code, EXIT.ok, created.stderr);

  const result = await agister(root, ["review", "--base", "main", "--agent", "codex-reviewer", "--quiet"]);
  assert.equal(result.code, EXIT.changesRequested, result.stderr);
  assert.match(result.stdout, /\[major\] a\.txt:2 — Off by one/);
  assert.match(result.stderr, /codex resume 01a0e850/);

  const [id] = (await agister(root, ["runs"])).stdout.split("\t");
  const record = JSON.parse((await agister(root, ["runs", "show", id!])).stdout);
  assert.equal(record.runtime, "codex");
  assert.equal(record.requestedSessionId, undefined);
  assert.equal(record.result.providerSessionId, "01a0e850-b808-71c2-8401-53ba16d8ae18");
  assert.deepEqual(record.output.findings[0].line, 2);

  const init = JSON.parse(readFileSync(join(root, ".agister", "runs", id!, "provider.jsonl"), "utf8").split("\n")[0]!);
  assert.equal(init.cwd, record.workspace);
  assert.deepEqual(init.argv.slice(init.argv.indexOf("--sandbox"), init.argv.indexOf("--sandbox") + 2), ["--sandbox", "read-only"]);
  assert.ok(init.argv.includes('model_reasoning_effort="xhigh"'));
  assert.match(init.prompt, /^<instructions>\nYou are an independent code reviewer/);
  assert.equal(init.schema.properties.findings.items.required.includes("line"), true);
  assert.equal(git(root, "worktree", "list").trim().split("\n").length, 1);
});

test("run refuses Claude-only tool flags for a Codex agent", async () => {
  const root = mkdtempSync(join(tmpdir(), "agister-test-"));
  await agister(root, ["agent", "create", "cx", "--runtime", "codex", "--command", FAKE_CODEX]);
  const refused = await agister(root, ["run", "cx", "--tools", "Read", "--prompt", "hi"]);
  assert.equal(refused.code, EXIT.usage);
  assert.match(refused.stderr, /is sandboxed and takes no tool list/);

  const ok = await agister(root, ["run", "cx", "--prompt", "hi", "--quiet"]);
  assert.equal(ok.code, EXIT.ok, ok.stderr);
  assert.equal(ok.stdout, "All good.\n");
});

test("diagnostic logs are written per run, correlated with the run record", async () => {
  const root = await withReviewer("approve");
  assert.equal((await agister(root, ["run", "reviewer", "--quiet", "--prompt", "hi"])).code, EXIT.ok);
  const [id] = (await agister(root, ["runs"])).stdout.split("\t");

  const lines = readFileSync(join(root, ".agister", "logs", "agister.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(lines[0].message, "turn.started");
  assert.equal(lines.at(-1).message, "turn.finished");
  // In between, only warnings: the fake runtime emits one unparseable line.
  assert.deepEqual(lines.slice(1, -1).map((line) => [line.level, line.kind]), [["warn", "STREAM_PARSE_ERROR"]]);
  const finished = lines.find((line) => line.message === "turn.finished");
  assert.equal(finished.runId, id);
  assert.equal(finished.runtime, "claude-code");
  assert.equal(finished.outcome, "completed");
  assert.ok(lines.every((line) => line.level !== "debug"), "file log is info+ without --debug");
});

test("--debug also streams debug logs to stderr", async () => {
  const root = await withReviewer("approve");
  const result = await agister(root, ["run", "reviewer", "--quiet", "--debug", "--prompt", "hi"]);
  assert.equal(result.code, EXIT.ok, result.stderr);
  const logged = result.stderr.split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
  assert.ok(logged.some((line) => line.level === "debug" && line.message === "turn.event"));
  assert.ok(logged.some((line) => line.message === "turn.finished"));
});
