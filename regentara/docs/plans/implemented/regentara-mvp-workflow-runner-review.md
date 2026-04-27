---
date: 2026-04-27
model: claude-opus-4-7
description: "Code review of the Regentara MVP workflow runner implementation against its spec and ADRs"
---

# Regentara MVP Workflow Runner Implementation Review

Scope: changed/added code on `codex/regentara-mvp-workflow-runner` vs `trunk`. Tests pass (`./scripts/run_silent.sh "regentara-tests" node --test regentara/tests/*.test.js` → ok).

## Major findings

### 1. Bad policy decision is mis-classified as startup failure — leaves run in `running` state

`regentara/src/orchestrator.js:113-115`

```js
if (policyResult.decision !== "remediate") {
  throw new StartupValidationFailure(`unsupported review policy decision: ${policyResult.decision}`);
}
```

By the time policy is called, the run directory exists. The catch block at `regentara/src/orchestrator.js:133` then skips metadata update precisely for `StartupValidationFailure`:

```js
if (run && !(error instanceof StartupValidationFailure)) {
  await updateRunMetadata(...)
}
```

So an unknown policy decision returns a failed result *but the on-disk metadata stays `status: "running"`.* This violates ADR-005 ("a runtime failure must mark the current run failed") and the fail-fast invariant.

**Fix:** throw `RuntimeFailure` (not startup) for unrecognized decisions, since this is post-run-creation. Add a regression test asserting `metadata.json.status === "failed"` for bad policy decisions.

### 2. Missing-artifact check is opt-in only — silently disabled in production

`regentara/src/orchestrator.js:169`

```js
if (output.artifact && artifactExists && !(await artifactExists(output.artifact))) {
  throw new RuntimeFailure(`expected artifact missing: ${output.artifact}`);
}
```

`artifactExists` comes from `dependencies.artifactExists` (`orchestrator.js:68,79,121`) but `regentara/src/composition.js:4-17` never injects one. Spec tests 49-50 ("not fabricate / fail immediately when expected artifact missing") therefore only hold under test-injected fakes. In the shipped CLI path, missing-artifact runtime failures will never fire — an agent that returns `{ artifact: "producer/result.json" }` without writing the file will be treated as success.

**Fix:** default `artifactExists` to a real `fs.access`-based implementation (joined to `run.runDirectory`), and wire it in `composition.js`. Add a test that drives `runWorkflow` through default composition (no `artifactExists` override) and asserts the missing-file failure.

### 3. Built-in schema refs are too permissive — remediator output can produce `undefined` task

`regentara/src/settings/agent-settings.js:15-20`

```js
const SUPPORTED_SCHEMA_REFS = new Map(
  REQUIRED_AGENTS.map((agent) => [
    `regentara://schemas/${agent}-output`,
    { type: "object" },
  ]),
);
```

All three refs resolve to `{ type: "object" }`. The remediator built-in schema does not require `task`, so `currentTask = remediatorResult.task` (`regentara/src/orchestrator.js:130`) can become `undefined` when configured via `schemaRef`. `regentara/README.md:33-37` advertises these refs as "supported output schemas" with no caveat.

**Fix:** make the built-in refs concrete:

- `producer-output`: `required: ["artifact"]` (or whatever the spec adopts)
- `reviewer-output`: `required: ["verdict"]`
- `remediator-output`: `required: ["task"]`

Add tests pinning each shape; otherwise document that built-in refs are placeholders and the CLI must use inline `output.schema`.

### 4. Failure result drops `runId` / `runDirectory` after run creation

`regentara/src/orchestrator.js:141`

```js
return failureResult(error);
```

`failureResult` (`regentara/src/errors.js:17-23`) only carries `status/exitCode/failureReason`. Per `regentara/docs/specs/mvp-workflow-runner.md:32-33`, `runId` and `runDirectory` are "present only when startup validation passed and a run was created" — runtime failures qualify. The `complete-fail` branch (`orchestrator.js:103-110`) does include them; the catch path does not. Operators losing the run directory on failure makes triage hard.

**Fix:** include `runId`/`runDirectory` in the catch-path failure result when `run` is set.

## Minor findings

### 5. Provider-CLI availability check is platform-fragile

`regentara/src/provider-cli-availability.js:27`

```js
await execFileAsync("command", ["-v", command], { shell: true });
```

`command` is a shell builtin; with `shell: true`, Node already wraps the call. Not portable to Windows and surprising to read. Use `which` (already an npm package) or scan `PATH` directly.

### 6. Leftover scaffold default in failure path

`regentara/src/errors.js:22`

```js
failureReason: error?.message ?? "not implemented",
```

"not implemented" is the placeholder from Task 1's scaffold. Default to `"unknown failure"` or assert that callers always pass an `Error` with a message.

### 7. `clock()` called twice in `createRun`

`regentara/src/run-store.js:14-16` invokes `clock` inside `createRunId(...)` and again for `startedAt`. With real `Date.now`, the run ID timestamp and metadata `startedAt` can drift across a second boundary.

**Fix:** snapshot once: `const now = clock();`, derive both from it.

### 8. Fragile `import.meta.url` main check

`regentara/src/index.js:46`

```js
if (import.meta.url === `file://${process.argv[1]}`)
```

Breaks for paths with spaces, symlinks, or Windows. Use `pathToFileURL(process.argv[1]).href`.

### 9. Provider CLI invocation passes minimal context

`regentara/src/provider-cli-executor.js:7-12` only forwards `--model` and pipes `JSON.stringify(executionInput)` to stdin. Spec test 25 only asserts cwd. Real `claude-code` / `codex` runners need richer flags (system prompt path, schema, etc.). Acceptable for the MVP scaffold but worth a follow-up ADR or a TODO before either runner is used end-to-end.

### 10. Default `ReviewFixPolicy` is a fail-stub

`regentara/src/composition.js:5` and `regentara/src/orchestrator.js:9-16`. Production `regentara` CLI invoked with no injected policy returns `complete-fail` for every review — making the CLI's golden path always-failing. Either remove the default and require injection (consistent with spec test 37), or document the placeholder explicitly.

### 11. `runtime-output.js` fallback path is redundant

`regentara/src/orchestrator.js:163-167` falls back to `providerResult.stdoutReference` (a 4096-char-truncated string from `provider-cli-executor.js:74`) when `jsonOutput` is missing. In practice `parseJsonOutput` already returns `undefined` for non-JSON, so this branch only ever feeds a possibly-truncated string into `JSON.parse`, which then surfaces an opaque "not valid JSON" error rather than the real cause. Drop the fallback or hand the raw stdout (untruncated) to validation.

## Spec/plan traceability

- Spec tests 1-56 are each represented in `regentara/tests/*.test.js`. Spot-checked agent-settings (1-12), model-routing (13-21), startup validation (22-24), provider CLI (25-27, 54), runtime output (28-30), sequence (31-36), policy (37-43), artifacts (44-47), failure (48-53, 55-56).
- Findings 2 and 3 are the cases where a passing test does not cover production behavior.

## Summary

Tests are green and the structure cleanly maps to the ADRs/spec. Four behavioral gaps (1-4) are worth fixing before treating the MVP as runnable end-to-end; the rest are polish.
