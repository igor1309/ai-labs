import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import yaml from "js-yaml";

import {
  composePolicy,
  loadPolicy,
  loadProcess,
  parsePolicy,
  parseProcess,
  type PolicyDefinition,
  type ProcessDefinition,
  type ServiceCeiling,
} from "../src/config.js";

// The design's own example files, read in place.
const RESEARCH = fileURLToPath(new URL("../../research/agister/research/verger/", import.meta.url));
const CEILING: ServiceCeiling = { maxTimeoutMs: 60 * 60_000, maxAttempts: 1 };
const SOURCE = { path: "test.yaml", sha256: "0" };

function research(kind: "processes" | "policies", name: string): unknown {
  return yaml.load(readFileSync(join(RESEARCH, kind, `${name}.yaml`), "utf8"), { schema: yaml.CORE_SCHEMA });
}

const staticReview = () => parsePolicy(research("policies", "static-review"), SOURCE, "static-review");
const adversarial = () => parseProcess(research("processes", "adversarial-review"), SOURCE, "adversarial_review");
const architecture = () => parseProcess(research("processes", "architecture-review"), SOURCE, "architecture_review");

function withOverrides(process: ProcessDefinition, overrides: Record<string, unknown>): ProcessDefinition {
  const document = { ...(research("processes", "adversarial-review") as object), ...overrides };
  return { ...parseProcess(document, SOURCE, "adversarial_review"), name: process.name };
}

test("parses the research policy and processes as written", () => {
  const policy = staticReview();
  assert.equal(policy.timeoutMs, 20 * 60_000);
  assert.deepEqual(policy.allow, ["repository.read", "repository.diff", "repository.search"]);
  assert.deepEqual(policy.deny, ["repository.write", "repository.history.write", "process.execute", "network"]);
  assert.deepEqual(policy.constraints, [{
    subject: "agent.model_family",
    notEqual: "candidate.writer.model_family",
    candidateInput: "candidate_revision",
    onUnsatisfied: "fail",
  }]);

  const process = adversarial();
  assert.equal(process.agent, "reviewer");
  assert.equal(process.policy, "static-review");
  assert.deepEqual(process.required, ["base_revision", "candidate_revision", "diff", "changed_files"]);
  assert.equal(process.outputSchema, "agister.review-result/v1alpha1");
  assert.match(process.instruction, /^Review the exact candidate independently/);
});

test("composes the effective static review: allowed minus denied, read-only, candidate scope", () => {
  const effective = composePolicy(adversarial(), staticReview(), CEILING);
  assert.deepEqual(effective.capabilities, ["repository.read", "repository.diff", "repository.search"]);
  assert.equal(effective.access, "read-only");
  assert.equal(effective.scope, "candidate");
  assert.equal(effective.timeoutMs, 20 * 60_000);
  assert.equal(effective.maxAttempts, 1);
  assert.deepEqual(effective.resources, ["reviews"]);
  assert.deepEqual(effective.retain, ["review_result", "run_log"]);
});

test("the architecture process narrows the shared timeout", () => {
  assert.equal(composePolicy(architecture(), staticReview(), CEILING).timeoutMs, 15 * 60_000);
});

test("narrowing is enforced field by field", () => {
  const policy = staticReview();
  const invalid = (overrides: Record<string, unknown>, pattern: RegExp) =>
    assert.throws(() => composePolicy(withOverrides(adversarial(), overrides), policy, CEILING), pattern);

  invalid({ timeout: "30m" }, /timeout: 30m widens the policy's 20m/);
  invalid({ tools: { allow: ["repository.read", "network"] } }, /tools.allow: adds network, which policy static-review does not allow/);
  invalid({ workspace: { access: "read-write" } }, /workspace.access: read-write widens policy static-review's read-only/);
  invalid({ workspace: { scope: "repository" } }, /workspace.scope: repository differs .* scope cannot be overridden/);
  invalid(
    { constraints: { "agent.model_family": { not_equal: "evidence.candidate(input.candidate_revision).provenance.writer.model_family", on_unsatisfied: "fail" } } },
    /already set by policy static-review; constraints can only be added/,
  );

  // Every violation is reported at once.
  assert.throws(
    () => composePolicy(withOverrides(adversarial(), { timeout: "2h", tools: { allow: ["network"] } }), policy, CEILING),
    (error: Error) => /timeout/.test(error.message) && /tools.allow/.test(error.message),
  );
});

test("narrowing in the permitted direction is accepted", () => {
  const effective = composePolicy(
    withOverrides(adversarial(), {
      timeout: "5m",
      tools: { allow: ["repository.read"] },
      isolation: { deny: ["repository.search"] },
      resources: ["gpu"],
      artifacts: { retain: ["transcript"] },
    }),
    staticReview(),
    CEILING,
  );
  assert.equal(effective.timeoutMs, 5 * 60_000);
  assert.deepEqual(effective.capabilities, ["repository.read"]);
  assert.ok(effective.deny.includes("repository.search"));
  assert.deepEqual(effective.resources, ["reviews", "gpu"]);
  assert.deepEqual(effective.retain, ["review_result", "run_log", "transcript"]);
});

test("isolation wins over the allowlist: a denied capability is never effective", () => {
  const policy: PolicyDefinition = { ...staticReview(), allow: ["repository.read", "process.execute"] };
  assert.deepEqual(composePolicy(adversarial(), policy, CEILING).capabilities, ["repository.read"]);
});

test("a policy outside the service ceiling is invalid, not clamped", () => {
  assert.throws(() => composePolicy(adversarial(), { ...staticReview(), timeoutMs: 2 * 60 * 60_000 }, CEILING), /policy static-review: timeout 2h exceeds the service ceiling 1h/);
  assert.throws(() => composePolicy(adversarial(), { ...staticReview(), maxAttempts: 3 }, CEILING), /retry.max_attempts 3 exceeds the service ceiling 1 \(retries are not implemented\)/);
});

test("without a policy the process's own fields apply, and a timeout is required", () => {
  const bare = parseProcess({ ...(research("processes", "adversarial-review") as object), policy: undefined }, SOURCE, "adversarial_review");
  assert.throws(() => composePolicy(bare, undefined, CEILING), /timeout: neither the process nor its policy sets one/);
  const effective = composePolicy(withOverrides(bare, { policy: undefined, timeout: "1m", tools: { allow: ["repository.read"] } }), undefined, CEILING);
  assert.deepEqual([effective.capabilities, effective.access, effective.scope], [["repository.read"], "read-only", "repository"]);
});

test("constraints must refer to an input the process requires", () => {
  const withoutCandidate = withOverrides(adversarial(), { input: { instruction: "x", required: ["diff"] } });
  assert.throws(() => composePolicy(withoutCandidate, staticReview(), CEILING), /refers to input.candidate_revision, which adversarial_review does not require/);
});

test("strict parsing: unknown fields, capabilities, schemas and references are errors", () => {
  const base = research("processes", "adversarial-review") as Record<string, unknown>;
  const invalid = (document: Record<string, unknown>, pattern: RegExp) =>
    assert.throws(() => parseProcess(document, SOURCE, "adversarial_review"), pattern);

  invalid({ ...base, surprise: 1 }, /surprise: unknown field/);
  invalid({ ...base, tools: { allow: ["repository.teleport"] } }, /unknown capabilities: repository.teleport/);
  invalid({ ...base, uses: "reviewer" }, /uses: must be "agent:<name>"/);
  invalid({ ...base, policy: "static-review" }, /policy: must be "process-policy:<name>"/);
  invalid({ ...base, output: { format: "json", schema: "x", require_valid: false } }, /require_valid: must be true/);
  invalid({ ...base, name: "other" }, /does not match file name/);
  invalid({ ...base, timeout: "soon" }, /timeout: invalid duration/);
  invalid(
    { ...base, constraints: { "agent.model_family": { not_equal: "task.claimed_author", on_unsatisfied: "fail" } } },
    /supported form: evidence.candidate/,
  );
  assert.throws(() => parsePolicy({ schema: "agister.process-policy/v1alpha1", name: "p", status: "x", colour: "red" }, SOURCE, "p"), /colour: unknown field/);
});

test("loads from the state directory with source digests for attribution", async () => {
  const state = mkdtempSync(join(tmpdir(), "agister-config-"));
  mkdirSync(join(state, "processes"));
  mkdirSync(join(state, "policies"));
  const processText = readFileSync(join(RESEARCH, "processes", "adversarial-review.yaml"), "utf8").replace("name: adversarial_review", "name: review");
  writeFileSync(join(state, "processes", "review.yaml"), processText);
  writeFileSync(join(state, "policies", "static-review.yaml"), readFileSync(join(RESEARCH, "policies", "static-review.yaml")));

  const process = await loadProcess(state, "review");
  assert.equal(process.source.path, join(state, "processes", "review.yaml"));
  assert.match(process.source.sha256, /^[0-9a-f]{64}$/);
  assert.equal((await loadPolicy(state, "static-review")).name, "static-review");
  await assert.rejects(loadProcess(state, "missing"), /process not found: missing/);
  await assert.rejects(loadProcess(state, "../escape"), /invalid process name/);
});
