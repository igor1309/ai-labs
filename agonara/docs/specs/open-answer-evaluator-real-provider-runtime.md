---
date: 2026-06-06
model: claude
description: "Spec: Agonara real Nomos LLM open-answer evaluator provider adapter, policy, in-process worker trigger, and composition-root wiring."
version: 0.0.1
status: draft
type: spec
---

# Open-Answer Evaluator Real-Provider Runtime

## Goal

Define the Agonara contract for a real LLM open-answer evaluation path: a Nomos-backed provider adapter, an LLM evaluator policy, the in-process single-flight worker trigger that runs it, and the composition-root wiring that supplies provider configuration from runtime environment. Owned by the operational server surface (`src/server.js`) and a new provider adapter module; the Student Workspace evaluator job boundary remains the owner of jobs, evidence, and final feedback.

This operationalizes [ADR-018](../adr/adr-018-open-answer-evaluator-real-provider-runtime.md) (which amends [ADR-015](../adr/adr-015-open-answer-evaluator-worker-provider-boundary.md)) and reuses the worker contract from [Student Workspace Open-Answer Evaluator Worker](student-workspace-open-answer-evaluator-worker.md). It closes `deployment-handoff.md` §6b. It does not add a durable queue, a separate worker process, raw-artifact persistence, prompt-template governance beyond the policy's declared inputs, model-routing, the curator-suggestion real path, or any UI.

## Public interface

### Provider adapter

A real provider adapter satisfying the `OpenAnswerEvaluatorProviderAdapter` shape from the worker spec, constructed at the composition root from runtime configuration:

The adapter calls Nomos, the repo's existing OpenAI-compatible LLM proxy, at `POST <baseUrl>/v1/chat/completions` with an `Authorization: Bearer <apiKey>` header and the configured `model` (`nomos/src/app.js`, `nomos/src/auth.js`).

```ts
type NomosOpenAnswerEvaluatorProviderConfig = {
  providerAdapterId: string;
  baseUrl: string;        // Nomos OpenAI-compatible gateway base URL (runtime env)
  model: string;          // model identifier (runtime env)
  apiKey: string;         // AGONARA_NOMOS_API_KEY (runtime env, never persisted)
  outputValidatorPolicyId: string;
  fetch?: typeof fetch;   // injectable for tests; defaults to global fetch
  now?: () => Date;
};

createNomosOpenAnswerEvaluatorProviderAdapter(
  config: NomosOpenAnswerEvaluatorProviderConfig,
) -> OpenAnswerEvaluatorProviderAdapter
```

`evaluate(request: OpenAnswerEvaluatorProviderRequest) -> OpenAnswerEvaluatorProviderResult` calls the Nomos gateway and returns a structured result whose `outputValidation` reflects validation of the model output. `OpenAnswerEvaluatorProviderRequest`, `OpenAnswerEvaluatorProviderResult`, and `OpenAnswerEvaluatorOutputValidation` are the shapes defined by the worker spec.

### LLM evaluator policy

```ts
makeLlmOpenAnswerEvaluatorPolicy(input: {
  evaluatorPolicyId: string;
  providerAdapterId: string;     // matches the adapter above
  outputValidatorPolicyId: string;
  redactionPolicyId: string;
  retryPolicy: OpenAnswerEvaluatorRetryPolicy;
  budgetPolicy?: OpenAnswerEvaluatorBudgetPolicy;
}) -> OpenAnswerEvaluatorPolicy   // evaluatorPathKind: "llm_assisted", rawArtifactPolicy: "none"
```

### In-process worker trigger

```ts
// Single-flight runner; at most one run proceeds at a time per server instance.
runOpenAnswerEvaluatorWorkerTick(input: {
  workerId: string;
  leaseDurationSeconds: number;
  now: string;
}) -> OpenAnswerEvaluatorWorkerResult<{
  summary: OpenAnswerEvaluatorWorkerRunSummary;
}>
```

An authenticated internal operational request invokes the tick (`claim_next` mode) exactly once per invocation. Exposed only when provider configuration is present. "Operational authorization" means the caller passes the same operations-access check the existing `GET /operations/diagnostics` route uses (an authenticated session with operations access), or presents a configured operational trigger token supplied as runtime env (the deploy smoke's authed-route token, `deployment-handoff.md` §7c). The concrete route name and payload are an ADR-018 non-goal; this spec fixes only the authorization and single-flight behavior.

### Composition-root wiring

`startServer` reads `AGONARA_NOMOS_BASE_URL`, `AGONARA_NOMOS_MODEL`, and `AGONARA_NOMOS_API_KEY` from the environment. When all are present, it constructs the Nomos adapter and the LLM evaluator policy, injects the adapter as a `providerAdapters` entry into the Student Workspace evaluator boundary, and registers the single-flight trigger. When any is absent, no real adapter, policy, or trigger is registered and the evaluator path stays stub-free (`providerAdapters: []`), preserving today's behavior.

## Behavior rules

1. `createNomosOpenAnswerEvaluatorProviderAdapter` rejects construction (throws) when `providerAdapterId`, `baseUrl`, `model`, `apiKey`, or `outputValidatorPolicyId` is missing, empty, whitespace-only, or non-string.
2. The returned adapter exposes `providerAdapterId` and `evaluatorPathKind: "llm_assisted"`.
3. `evaluate` issues exactly one HTTP request per provider call to `POST <baseUrl>/v1/chat/completions`, using the configured `model` and an `Authorization: Bearer <apiKey>` header.
4. `evaluate` builds the model prompt only from the request's submitted answer, accepted check revision, and accepted criterion revisions; it MUST NOT include credentials, authorization headers, session/CSRF identifiers, SQL text, stack traces, filesystem paths, database URLs, or other infrastructure details in the prompt.
5. `evaluate` maps model output to one `criterionFeedback` entry per accepted criterion revision id on the request, with no unknown and no extra criterion ids, and a non-empty `summaryFeedback`.
6. `evaluate` returns `outputValidation` with the policy's `outputValidatorPolicyId` and `passed: true` only when the model output has exactly the required criterion feedback, a safe non-empty summary, and no forbidden operational detail; otherwise it returns `passed: false`.
7. `evaluate` normalizes `providerUsage` (calls, input/output tokens, estimated cost) into a non-secret summary and MUST NOT include credentials, raw request/response payloads, cookies, session ids, or infrastructure details in it.
8. `evaluate` discards raw prompts, raw model responses, and raw provider request/response payloads after validation and normalization; it MUST NOT return, persist, log, or surface them.
9. A non-2xx Nomos response, a network failure, or a malformed/unparseable model response causes `evaluate` to throw (so the worker fails the claimed job retryably per the worker spec), without leaking response bodies, credentials, or infrastructure details in the error.
10. `makeLlmOpenAnswerEvaluatorPolicy` returns a policy with `evaluatorPathKind: "llm_assisted"`, `rawArtifactPolicy: "none"`, the given provider adapter id, output validator id, redaction id, retry policy, and optional budget policy, and a prompt input policy that includes the submitted answer, accepted check revision, and accepted criterion revisions.
11. `runOpenAnswerEvaluatorWorkerTick` runs `runOpenAnswerEvaluatorWorkerOnce` in `claim_next` mode and returns its result.
12. The tick is single-flight: while one tick is in progress, a concurrent invocation does not start a second overlapping worker run.
13. The internal operational trigger requires operational authorization — an authenticated session with operations access (as `GET /operations/diagnostics` requires) or a configured operational trigger token — and rejects unauthenticated, wrong-token, or ordinary-product (Student, Program Curator, Admin without operations access) callers without running a worker tick or authoring feedback.
14. When provider configuration env is incomplete, `startServer` registers no real adapter, no LLM policy, and no trigger, and the evaluator boundary receives `providerAdapters: []` (unchanged from today).
15. When provider configuration env is complete, `startServer` injects the Nomos adapter and LLM policy and registers the trigger, and the credential/base URL/model values appear only in the adapter closure — never in domain records, evaluator policies persisted as data, logs, backups, the health response, or run summaries.
16. The real path preserves all worker-spec behavior: lease validation, provider side-effect isolation, output validation before acceptance, budget enforcement, idempotent completion, raw-artifact exclusion, credential exclusion, log redaction, and backup/restore rejection of forbidden artifacts.

## Product intent traceability

Operationalizes the real open-answer evaluation that backs accepted Student Workspace open-answer stories (STU-13) and the LLM-assisted evaluation intent (INT-05) under Student Workspace governance, without changing the accepted promise — it replaces the absent runtime provider with a governed real one. No new user-facing story is introduced.

## Tests (required)

Provider adapter:

1. Construction rejects missing/empty/non-string `providerAdapterId`, `baseUrl`, `model`, `apiKey`, and `outputValidatorPolicyId`.
2. `evaluate` issues one request to `baseUrl` with the configured `model` and a bearer-token auth header (injected `fetch` fake).
3. `evaluate` prompt content excludes credentials, auth headers, session/CSRF ids, SQL, stack traces, filesystem paths, database URLs, and infrastructure details.
4. `evaluate` returns one criterion feedback per accepted criterion revision id, no unknown/extra ids, and a non-empty summary for well-formed model output.
5. `evaluate` returns `outputValidation.passed: true` only for valid output and `passed: false` for missing/extra/unknown criterion feedback, empty/unsafe summary, or forbidden detail.
6. `evaluate` returns a normalized, secret-free `providerUsage` summary.
7. `evaluate` does not return or expose raw prompt, raw model response, or raw provider payloads.
8. `evaluate` throws (without leaking bodies/credentials) on non-2xx, network failure, and malformed model responses; through the worker this fails the claimed job retryably.

Policy and trigger:

9. `makeLlmOpenAnswerEvaluatorPolicy` produces an `llm_assisted`, `rawArtifactPolicy: "none"` policy referencing the adapter, validator, redaction, retry, and budget inputs and the required prompt inputs.
10. `runOpenAnswerEvaluatorWorkerTick` claims and runs the next claimable job via `claim_next` and returns the worker result.
11. The tick is single-flight under overlapping invocations (no two overlapping worker runs).
12. The internal trigger rejects unauthenticated, wrong-token, and ordinary-product callers without running a tick or authoring feedback.

Composition root:

13. With incomplete provider env, `startServer` registers no adapter/policy/trigger and the evaluator boundary receives `providerAdapters: []`.
14. With complete provider env, `startServer` injects the adapter and policy and registers the trigger, and the api key / base URL / model never appear in health responses, logs, run summaries, evaluator job summaries, evidence, evaluation summaries, or backups.

Executable acceptance:

15. End-to-end with an injected `fetch` fake standing in for Nomos: a student submits an open answer, Student Workspace schedules evaluator work, the authenticated trigger runs one single-flight tick, the Nomos adapter builds a credential-free prompt from accepted revisions and the submitted answer, returns validated output, the worker records redacted evidence and completes final feedback tied to accepted criterion revision ids, duplicate-safe completion holds, raw artifacts are absent from summaries/logs/backups, and credentials never leak.

## Done criteria

- A Nomos-backed `OpenAnswerEvaluatorProviderAdapter` exists, built at the composition root from runtime env, satisfying every ADR-015 provider-adapter invariant.
- An LLM evaluator policy references the adapter and mandates output validation with `rawArtifactPolicy: "none"`.
- An authenticated, single-flight in-process trigger runs `runOpenAnswerEvaluatorWorkerOnce` in `claim_next` mode.
- Provider base URL, model, and `AGONARA_NOMOS_API_KEY` are read only from runtime env and never persisted, logged, surfaced, or committed.
- Real model output is validated before final acceptance; invalid output fails the job retryably.
- Raw prompts, raw responses, and raw provider payloads are never persisted, exported, restored, logged, or surfaced; only normalized non-secret usage summaries persist.
- With provider env absent, behavior is identical to today (no adapter, no trigger, `providerAdapters: []`).
- Every behavior rule is covered by a listed test or the executable acceptance flow.
