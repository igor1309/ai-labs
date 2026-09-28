import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import yaml from "js-yaml";

import { composeAgister } from "../src/composition-root.js";
import { parseDuration } from "../src/duration.js";
import { EXIT, main, type Io } from "../src/main.js";

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

// A candidate repository with the example definitions from `agister init`,
// whose agents point at the fake runtimes.
async function workspace(scenario: string): Promise<string> {
  const root = repository(scenario);
  for (const argv of [
    ["init"],
    ["agent", "create", "reviewer", "--force", "--model", "sonnet", "--model-family", "anthropic", "--effort", "high", "--command", FAKE_CLAUDE],
    ["agent", "create", "codex-reviewer", "--force", "--runtime", "codex", "--model-family", "openai", "--command", FAKE_CODEX],
  ]) {
    const result = await agister(root, argv);
    assert.equal(result.code, EXIT.ok, result.stderr);
  }
  return root;
}

async function lastRun(root: string) {
  const ids = (await agister(root, ["runs"])).stdout.trim().split("\n").map((line) => line.split("\t")[0]!);
  const id = ids.at(-1)!;
  const directory = join(root, ".agister", "runs", id);
  return {
    id,
    record: JSON.parse(readFileSync(join(directory, "run.json"), "utf8")),
    events: readFileSync(join(directory, "events.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line)),
    // The fakes echo their argv, cwd and prompt in the first stream line.
    init: existsSync(join(directory, "provider.jsonl"))
      ? JSON.parse(readFileSync(join(directory, "provider.jsonl"), "utf8").split("\n")[0]!)
      : undefined,
  };
}

function flag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

// ---------------------------------------------------------------------------
// Agents

test("agent create writes a profile that agent list reads back", async () => {
  const root = mkdtempSync(join(tmpdir(), "agister-test-"));
  const created = await agister(root, ["agent", "create", "reviewer", "--model", "opus", "--model-family", "anthropic", "--effort", "xhigh"]);
  assert.equal(created.code, EXIT.ok, created.stderr);

  const toml = readFileSync(join(root, ".agister", "agents", "reviewer.toml"), "utf8");
  assert.equal(toml, `schema = "agister.agent/v1alpha1"
name = "reviewer"
runtime = "claude-code"
model = "opus"
model_family = "anthropic"
effort = "xhigh"
session = "fresh-only"
`);

  const listed = await agister(root, ["agent", "list"]);
  assert.equal(listed.stdout, "reviewer\tclaude-code\topus\txhigh\tanthropic\n");

  const duplicate = await agister(root, ["agent", "create", "reviewer"]);
  assert.equal(duplicate.code, EXIT.runFailed);
  assert.match(duplicate.stderr, /already exists/);
  assert.equal((await agister(root, ["agent", "create", "reviewer", "--force"])).code, EXIT.ok);
});

test("agent create rejects unsupported runtimes and efforts", async () => {
  const root = mkdtempSync(join(tmpdir(), "agister-test-"));
  assert.equal((await agister(root, ["agent", "create", "x", "--runtime", "gemini"])).code, EXIT.usage);
  assert.equal((await agister(root, ["agent", "create", "x", "--effort", "extreme"])).code, EXIT.usage);
  assert.equal((await agister(root, ["agent", "create", "x", "--runtime", "codex", "--effort", "max"])).code, EXIT.usage);
  assert.equal((await agister(root, ["agent", "create", "x", "--runtime", "claude-code", "--effort", "minimal"])).code, EXIT.usage);
  assert.equal((await agister(root, ["agent", "create", "Bad_Name"])).code, EXIT.runFailed);
});

// ---------------------------------------------------------------------------
// Definitions

test("init copies the example definitions and keeps existing files", async () => {
  const root = mkdtempSync(join(tmpdir(), "agister-test-"));
  const first = await agister(root, ["init"]);
  assert.equal(first.code, EXIT.ok, first.stderr);
  assert.equal(first.stdout.match(/^created /gm)?.length, 7);

  const second = await agister(root, ["init"]);
  assert.equal(second.stdout.match(/^kept /gm)?.length, 7);

  const listed = await agister(root, ["process", "list"]);
  assert.equal(listed.stdout, [
    "adversarial_review\tagent:reviewer\tprocess-policy:static-review\tagister.review-result/v1alpha1",
    "adversarial_review_sandboxed\tagent:codex-reviewer\tprocess-policy:sandboxed-review\tagister.review-result/v1alpha1",
    "architecture_review\tagent:reviewer\tprocess-policy:static-review\tagister.review-result/v1alpha1",
    "",
  ].join("\n"));
});

test("the example static-review policy is the research file", () => {
  const load = (path: string) => {
    const { status: _status, ...document } = yaml.load(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")) as Record<string, unknown>;
    return document;
  };
  assert.deepEqual(load("../templates/policies/static-review.yaml"), load("../../research/agister/research/verger/policies/static-review.yaml"));
});

test("process show resolves the effective policy and whether the runtime can enforce it", async () => {
  const root = await workspace("approve");
  const shown = await agister(root, ["process", "show", "architecture_review"]);
  assert.equal(shown.code, EXIT.ok, shown.stderr);
  assert.match(shown.stdout, /^capabilities repository.read, repository.diff, repository.search$/m);
  assert.match(shown.stdout, /^  denied     repository.write, repository.history.write, process.execute, network$/m);
  assert.match(shown.stdout, /^workspace    read-only, scope candidate$/m);
  assert.match(shown.stdout, /^timeout      15m; attempts 1$/m);
  assert.match(shown.stdout, /^runtime      can enforce this policy$/m);

  const codex = await agister(root, ["process", "show", "adversarial_review", "--agent", "codex-reviewer"]);
  assert.match(codex.stdout, /CANNOT enforce this policy:\n  the read-only sandbox also grants repository.history.read, which the policy does not allow\n  the read-only sandbox also grants process.execute/);
});

test("an invalid definition is a configuration error that names every problem", async () => {
  const root = await workspace("approve");
  const path = join(root, ".agister", "processes", "adversarial_review.yaml");
  writeFileSync(path, readFileSync(path, "utf8").replace("type: process", "type: process\ntimeout: 45m\ntools:\n  allow: [network]"));
  const result = await agister(root, ["review", "--base", "main"]);
  assert.equal(result.code, EXIT.usage);
  assert.match(result.stderr, /process adversarial_review is invalid:\n  timeout: 45m widens the policy's 20m\n  tools.allow: adds network/);
  assert.equal((await agister(root, ["runs"])).stdout, "");
});

// ---------------------------------------------------------------------------
// Running processes

test("review runs the adversarial_review process from its definition files", async () => {
  const root = await workspace("approve");
  const result = await agister(root, ["review", "--base", "main", "--quiet"]);
  assert.equal(result.code, EXIT.ok, result.stderr);
  assert.match(result.stdout, /^Verdict: approve\n\nLooks fine\.\n\n\[nit\] a\.txt — Wording\n  Consider rewording\.\n$/);

  const { record, events, init } = await lastRun(root);
  assert.equal(record.process, "adversarial_review");
  assert.equal(record.definition.policy, "static-review");
  assert.equal(record.definition.outputSchema, "agister.review-result/v1alpha1");
  assert.deepEqual(record.definition.sources.map((source: { path: string }) => source.path), [
    join(root, ".agister", "processes", "adversarial_review.yaml"),
    join(root, ".agister", "policies", "static-review.yaml"),
  ]);
  assert.equal(record.inputs.candidate_revision, git(root, "rev-parse", "HEAD").trim());
  assert.equal(record.inputs.base_revision, git(root, "rev-parse", "main").trim());
  assert.deepEqual(record.inputs.changed_files, ["a.txt"]);
  assert.equal(record.output.verdict, "approve");

  // Capabilities, mapped onto Claude Code's tool surface.
  assert.ok(init.argv.includes("--tools=Read,Glob,Grep"));
  assert.ok(init.argv.includes("--allowedTools=Read,Glob,Grep"));
  // Diffs would need Bash, which Claude Code cannot fence; the diff is an input instead.
  const withheld = events.find((event: { kind: string }) => event.kind === "CAPABILITIES_WITHHELD");
  assert.deepEqual(withheld.data.capabilities, ["repository.diff"]);
  // The process instruction and policy are rendered for the agent.
  const system = flag(init.argv, "--append-system-prompt")!;
  assert.match(system, /^Review the exact candidate independently and adversarially/);
  assert.match(system, /Permitted: repository.read, repository.diff, repository.search\. Anything else is denied by policy\./);
  assert.match(system, /read-only/);
  // Required inputs, rendered as sections of the prompt.
  assert.match(init.prompt, /^## base_revision\n\n[0-9a-f]{40}\n\n## candidate_revision\n\n[0-9a-f]{40}\n\n## diff\n\n```diff\n/);
  assert.match(init.prompt, /## changed_files\n\n- a\.txt$/);

  // Candidate scope: a detached worktree, cleaned up afterwards.
  assert.equal(init.cwd, record.workspace);
  assert.ok(!existsSync(record.workspace));
  assert.equal(git(root, "worktree", "list").trim().split("\n").length, 1);

  // The cross-family constraint was evaluated before anything was spawned.
  const kinds = events.map((event: { kind: string }) => event.kind);
  assert.ok(kinds.indexOf("CONSTRAINT_CHECKED") < kinds.indexOf("PROCESS_STARTED"));
  const constraint = events.find((event: { kind: string }) => event.kind === "CONSTRAINT_CHECKED");
  assert.equal(constraint.data.satisfied, true);
  assert.match(constraint.data.basis, /no Agister-recorded agent provenance/);
});

test("review verdicts and failures map to exit codes", async () => {
  const cases: Array<[string, number, RegExp]> = [
    ["request_changes", EXIT.changesRequested, /\[major\] a\.txt:2 — Off by one/],
    ["invalid_output", EXIT.runFailed, /failed \(invalid review output: verdict\)/],
    ["error_result", EXIT.runFailed, /failed \(provider_error_during_execution: tool crashed\)/],
  ];
  for (const [scenario, code, pattern] of cases) {
    const root = await workspace(scenario);
    const result = await agister(root, ["review", "--base", "main", "--quiet"]);
    assert.equal(result.code, code, `${scenario}: ${result.stderr}`);
    assert.match(result.stdout + result.stderr, pattern);
  }
});

test("a runtime that cannot enforce the policy is refused before any run", async () => {
  const root = await workspace("approve");
  const result = await agister(root, ["review", "--base", "main", "--agent", "codex-reviewer"]);
  assert.equal(result.code, EXIT.usage);
  assert.match(result.stderr, /agent codex-reviewer \(codex\) cannot enforce process adversarial_review's policy/);
  assert.equal((await agister(root, ["runs"])).stdout, "");
});

test("the sandboxed variant runs the same review on Codex", async () => {
  const root = await workspace("request_changes");
  const result = await agister(root, ["process", "run", "adversarial_review_sandboxed", "--base", "main", "--quiet"]);
  assert.equal(result.code, EXIT.changesRequested, result.stderr);
  assert.match(result.stderr, /codex resume 01a0e850/);

  const { record, init } = await lastRun(root);
  assert.equal(record.runtime, "codex");
  assert.equal(record.definition.policy, "sandboxed-review");
  assert.equal(flag(init.argv, "--sandbox"), "read-only");
  assert.match(init.prompt, /^<instructions>\nReview the exact candidate independently/);
  assert.match(init.prompt, /## candidate_revision\n\n[0-9a-f]{40}/);
  assert.match(init.prompt, /## changed_files\n\n- a\.txt/);
  assert.match(init.prompt, /## diff\n\n```diff\n/);
});

test("required inputs: missing, extra and file-provided", async () => {
  const root = await workspace("approve");
  const missing = await agister(root, ["process", "run", "architecture_review", "--base", "main"]);
  assert.equal(missing.code, EXIT.usage);
  assert.match(missing.stderr, /missing required inputs: architecture_context/);

  const extra = await agister(root, ["process", "run", "adversarial_review", "--base", "main", "--input", "focus=auth"]);
  assert.equal(extra.code, EXIT.usage);
  assert.match(extra.stderr, /does not take inputs: focus/);

  writeFileSync(join(root, "ARCHITECTURE.md"), "Layers: cli -> application -> adapters.\n");
  const ok = await agister(root, ["process", "run", "architecture_review", "--base", "main", "--quiet", "--input", "architecture_context=@ARCHITECTURE.md"]);
  assert.equal(ok.code, EXIT.ok, ok.stderr);
  const { record } = await lastRun(root);
  assert.equal(record.inputs.architecture_context, "Layers: cli -> application -> adapters.\n");
  assert.equal(record.definition.effective.timeoutMs, 15 * 60_000);
});

test("an unsatisfied cross-family constraint is recorded as a refusal and spawns nothing", async () => {
  const root = await workspace("approve");
  const candidate = git(root, "rev-parse", "HEAD").trim();
  mkdirSync(join(root, ".agister", "provenance"), { recursive: true });
  writeFileSync(join(root, ".agister", "provenance", `${candidate}.json`), JSON.stringify({
    writer: { agent: "builder", modelFamily: "anthropic", runId: "20260928T000000Z-abcdef" },
  }));

  const refused = await agister(root, ["review", "--base", "main", "--quiet"]);
  assert.equal(refused.code, EXIT.runFailed);
  assert.match(refused.stderr, /failed \(constraint_unsatisfied: agent.model_family anthropic equals the candidate writer's \(run 20260928T000000Z-abcdef\)\)/);
  const { events, init } = await lastRun(root);
  assert.equal(init, undefined);
  assert.ok(!events.some((event: { kind: string }) => event.kind === "PROCESS_STARTED"));

  // A different family satisfies it.
  await agister(root, ["agent", "create", "reviewer", "--force", "--model-family", "other", "--command", FAKE_CLAUDE]);
  assert.equal((await agister(root, ["review", "--base", "main", "--quiet"])).code, EXIT.ok);
});

test("a constrained process needs an agent that declares its model family", async () => {
  const root = await workspace("approve");
  await agister(root, ["agent", "create", "reviewer", "--force", "--command", FAKE_CLAUDE]);
  const result = await agister(root, ["review", "--base", "main"]);
  assert.equal(result.code, EXIT.usage);
  assert.match(result.stderr, /constrains agent.model_family, but agent reviewer declares no model_family/);
});

test("--timeout can shorten the effective timeout but never extend it", async () => {
  const root = await workspace("approve");
  await agister(root, ["review", "--base", "main", "--quiet", "--timeout", "5m"]);
  await agister(root, ["review", "--base", "main", "--quiet", "--timeout", "2h"]);
  const started = readFileSync(join(root, ".agister", "logs", "agister.jsonl"), "utf8").trim().split("\n")
    .map((line) => JSON.parse(line)).filter((line) => line.message === "turn.started");
  assert.deepEqual(started.map((line) => line.timeoutMs), [5 * 60_000, 20 * 60_000]);
});

test("review refuses an empty candidate and a missing agent", async () => {
  const root = await workspace("approve");
  const empty = await agister(root, ["review", "--base", "HEAD"]);
  assert.equal(empty.code, EXIT.runFailed);
  assert.match(empty.stderr, /nothing to compare/);

  const missing = await agister(root, ["review", "--base", "main", "--agent", "ghost"]);
  assert.match(missing.stderr, /agent not found: ghost/);
  assert.equal((await agister(root, ["runs"])).stdout, "");
});

// ---------------------------------------------------------------------------
// Ad-hoc runs

test("run executes one ad-hoc turn with read and search capabilities by default", async () => {
  const root = await workspace("approve");
  const result = await agister(root, ["run", "reviewer", "--quiet"], "What is here?");
  assert.equal(result.code, EXIT.ok, result.stderr);
  assert.equal(result.stdout, "All good.\n");
  assert.match(result.stderr, /: completed \$0\.0123 3\.4s 1 permission denial/);

  const { record, events, init } = await lastRun(root);
  assert.equal(record.process, "ad-hoc");
  assert.equal(record.result.providerSessionId, record.requestedSessionId);
  assert.deepEqual(events.map((event: { seq: number }) => event.seq), events.map((_: unknown, index: number) => index + 1));
  assert.ok(init.argv.includes("--tools=Read,Glob,Grep"));
  assert.ok(init.argv.includes("--restricted"));
});

test("run checks requested capabilities against the agent's runtime", async () => {
  const root = await workspace("approve");
  const unknown = await agister(root, ["run", "reviewer", "--allow", "telepathy", "--prompt", "hi"]);
  assert.equal(unknown.code, EXIT.usage);
  assert.match(unknown.stderr, /unknown capabilities: telepathy/);

  const refused = await agister(root, ["run", "codex-reviewer", "--prompt", "hi"]);
  assert.equal(refused.code, EXIT.usage);
  assert.match(refused.stderr, /agent codex-reviewer \(codex\) cannot enforce capabilities repository.read, repository.search/);

  const sandboxed = "repository.read,repository.search,repository.diff,repository.history.read,process.execute";
  const unfenced = await agister(root, ["run", "reviewer", "--allow", sandboxed, "--prompt", "hi"]);
  assert.equal(unfenced.code, EXIT.usage);
  assert.match(unfenced.stderr, /agent reviewer \(claude-code\) cannot enforce .*\n  unrestricted Bash \(process.execute\) also grants repository.write/);

  const ok = await agister(root, ["run", "codex-reviewer", "--allow", sandboxed, "--prompt", "hi", "--quiet"]);
  assert.equal(ok.code, EXIT.ok, ok.stderr);
  assert.equal(ok.stdout, "All good.\n");
});

// ---------------------------------------------------------------------------
// Logging

test("diagnostic logs are written per run, correlated with the run record", async () => {
  const root = await workspace("approve");
  assert.equal((await agister(root, ["run", "reviewer", "--quiet", "--prompt", "hi"])).code, EXIT.ok);
  const { id } = await lastRun(root);

  const lines = readFileSync(join(root, ".agister", "logs", "agister.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(lines[0].message, "turn.started");
  assert.deepEqual(lines[0].capabilities, ["repository.read", "repository.search"]);
  assert.equal(lines.at(-1).message, "turn.finished");
  // In between, only warnings: the fake runtime emits one unparseable line.
  assert.deepEqual(lines.slice(1, -1).map((line) => [line.level, line.kind]), [["warn", "STREAM_PARSE_ERROR"]]);
  assert.equal(lines.at(-1).runId, id);
  assert.equal(lines.at(-1).runtime, "claude-code");
});

test("--debug also streams debug logs to stderr", async () => {
  const root = await workspace("approve");
  const result = await agister(root, ["run", "reviewer", "--quiet", "--debug", "--prompt", "hi"]);
  assert.equal(result.code, EXIT.ok, result.stderr);
  const logged = result.stderr.split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
  assert.ok(logged.some((line) => line.level === "debug" && line.message === "turn.event"));
  assert.ok(logged.some((line) => line.message === "turn.finished"));
});

test("parses durations", () => {
  assert.equal(parseDuration("90s"), 90_000);
  assert.equal(parseDuration("10m"), 600_000);
  assert.equal(parseDuration("250ms"), 250);
  assert.equal(parseDuration("5"), 5_000);
  assert.throws(() => parseDuration("soon"), /invalid duration/);
});
