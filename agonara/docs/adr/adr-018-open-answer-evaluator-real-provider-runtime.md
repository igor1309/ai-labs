---
date: 2026-06-06
model: claude
description: "Amends ADR-015 to decide the real evaluator worker runtime topology, output validation requirement, raw-artifact policy, and provider credential mechanism for a real LLM evaluation path."
status: accepted
---

# ADR-018 - Open-Answer Evaluator Real-Provider Runtime

## Executive Summary

This ADR amends [ADR-015](adr-015-open-answer-evaluator-worker-provider-boundary.md) to enable a real LLM evaluation path while preserving every ADR-015 invariant.

The evaluator worker runs **in-process on the deployed server, single-flight**, driven by an authenticated internal operational trigger; durable queues and external runners remain deferred.

Real LLM provider output is **untrusted until it passes an explicit, reviewable output validation** producing `passed: true` before Student Workspace can accept it.

Raw evaluator artifacts remain **not persisted, not exported, not restored, not logged, not surfaced** — the real path discards transcripts after in-memory validation and keeps only normalized non-secret usage summaries.

Provider configuration (base URL, model, API key) is **env-only at the composition root**, using Agonara's own Nomos project and key, never in domain records, logs, or backups.

This ADR decides runtime topology, output validation, artifact policy, and the credential mechanism. It does not choose prompt text, the Nomos project/model, HTTP route names, or storage layout.

## Context

ADR-015 fixed the evaluator worker and provider-adapter safety boundary but deliberately deferred, as non-goals: whether the first worker runs in-process / in a separate process / in a queue / in a scheduler / in an external runner; the concrete output schema "beyond requiring later specs to define and validate one"; raw-artifact retention/backup/redaction policy; and the provider credential mechanism. ADR-015's consequences anticipated this amendment: "The worker boundary can start in-process and later move to a durable queue or external runner while preserving the same Student Workspace job contract," and prompt construction plus output validation should be "reviewable before provider calls are implemented."

[`deployment-handoff.md`](../deployment-handoff.md) records gate **G2**: a real Nomos evaluation path needs these decisions before the §6b application code (a real provider adapter, an evaluator policy, output validation, worker runtime wiring, and composition-root credential wiring) is built and before the production real-LLM deploy smoke can run. The runtime reality today: `src/server.js` injects no `providerAdapters` into the evaluator and never invokes `runOpenAnswerEvaluatorWorkerOnce`; no `fetch`/HTTP LLM call exists in the backend. The only adapter is a deterministic curator-suggestion stub.

Constraints:

- ADR-017 commits an in-process, single-host, dockerized deployment with no durable queue infrastructure. A separate worker process or broker would add operational surface ADR-017 does not provide.
- The production deploy smoke must exercise one real evaluation through Nomos, which requires a way to drive exactly one evaluation deterministically.
- ADR-015 requires that provider output be validated and that raw artifacts not leak through feedback, logs, or backups; a real model produces real transcripts that pressure-test this.
- Per the repo "Nomos API Keys" rule, Agonara must use its own Nomos project and key, supplied as runtime configuration.
- The Nomos gateway already exists in this repo as a unified OpenAI-compatible LLM proxy exposing `POST /v1/chat/completions` with per-project `Authorization: Bearer` tokens (`nomos/src/app.js`, `nomos/src/auth.js`), so the real provider call is a known-feasible HTTP integration rather than an aspirational one.

Rejected alternatives: a durable queue or external runner for v1 (adds infrastructure ADR-017 does not have, and ADR-015 allows starting in-process); a continuously-running background loop with no explicit trigger (makes the deploy smoke nondeterministic and complicates single-flight guarantees); persisting raw transcripts for debugging (ADR-015 blocks this until a dedicated artifact policy exists, and none is justified yet); and reading credentials from anything other than runtime env (would violate ADR-015's credential exclusion).

## Decision

The Agonara open-answer evaluator worker MUST run in-process within the deployed Agonara server for v1. Execution MUST be single-flight: at most one evaluator worker run proceeds at a time within a server instance.

Worker execution MUST be driven by an explicit trigger — an authenticated internal operational request that runs `runOpenAnswerEvaluatorWorkerOnce` in `claim_next` mode by default and MAY target one explicit evaluator job for deterministic operator smoke runs. An optional bounded interval MAY also drive single-flight runs, but the authenticated trigger MUST exist so a deploy smoke can deterministically drive exactly one evaluation. The trigger MUST require operational authorization and MUST NOT grant ordinary Student, Program Curator, or Admin product authority over feedback authoring.

A real LLM evaluator path MUST execute through a provider adapter that calls the Nomos gateway over HTTP. The adapter MUST honour all ADR-015 provider-adapter invariants: side-effect-limited, returning bounded execution results, mutating no Student Workspace, Corpus Storage, Program Membership, Identity, session, CSRF, credential, or backup state.

Real LLM provider output MUST be treated as untrusted and MUST pass an explicit output validation, referenced by the evaluator policy's `outputValidatorPolicyId`, that yields `passed: true` before Student Workspace accepts it as final feedback. The validation MUST reject missing or extra criterion feedback, unknown criterion revision identifiers, malformed or missing summary feedback, malformed provider usage, and any forbidden operational detail. The validation contract MUST be reviewable independently of the provider call.

Raw evaluator artifacts (raw prompts, raw model responses, provider request/response payloads, provider diagnostics) for the real path MUST NOT be persisted in domain records, exported in backups, restored from backups, written to logs, or surfaced through job/evidence/final-feedback/run summaries. The worker MAY hold them in memory only long enough to validate and normalize, then MUST discard them. Only normalized, non-secret provider usage summaries MAY be persisted, per ADR-015.

Provider configuration — Nomos base URL, model identifier, and API key — MUST be supplied to the composition root as runtime environment configuration (`AGONARA_NOMOS_API_KEY` plus the base URL and model), using Agonara's own Nomos project and key. It MUST be injected into the provider adapter at the composition root and MUST NOT appear in domain records, evaluator policies persisted as data, logs, backups, or the repository.

## Rules / Invariants

- The evaluator worker MUST run in-process in the deployed server for v1; no durable queue, broker, or external runner is introduced.
- Evaluator worker execution MUST be single-flight within a server instance.
- An authenticated internal operational trigger MUST exist that runs `runOpenAnswerEvaluatorWorkerOnce` once per invocation: `claim_next` by default, or `single_job` when an operator supplies one explicit evaluator job id.
- The trigger MUST require operational authorization and MUST NOT confer Student, Program Curator, or Admin feedback-authoring authority.
- The real provider adapter MUST call the Nomos gateway over HTTP and MUST satisfy every ADR-015 provider-adapter side-effect and ownership invariant.
- Real LLM output MUST pass an explicit, policy-referenced output validation (`passed: true`) before final acceptance.
- Output validation MUST reject missing/extra/unknown criterion feedback, malformed or missing summary feedback, malformed provider usage, and forbidden operational details.
- The output validation contract MUST be defined and reviewable before provider calls are wired (ADR-015 carryover).
- Raw evaluator artifacts MUST NOT be persisted, exported, restored, logged, or surfaced; they MAY exist only transiently in memory during validation/normalization.
- Only normalized non-secret provider usage summaries MAY be persisted (ADR-015 carryover).
- Provider base URL, model, and `AGONARA_NOMOS_API_KEY` MUST be runtime env at the composition root, injected into the adapter, and MUST NOT appear in domain records, logs, backups, or the repository.
- Agonara MUST use its own Nomos project and key; it MUST NOT reuse another project's key (repo "Nomos API Keys" rule).
- All ADR-015 invariants remain in force; this ADR only resolves ADR-015's named non-goals for worker topology, output schema requirement, raw-artifact policy, and credential mechanism.

## Consequences

Gate G2 is closed: the §6b application code (real provider adapter, LLM evaluator policy, output validation, worker runtime trigger, composition-root credential wiring) now has the decisions it depends on, and the production deploy smoke can drive one real Nomos evaluation deterministically through the authenticated trigger.

Running the worker in-process keeps Agonara within ADR-017's single-host, no-queue operational shape. The cost is that long or numerous evaluations contend with request handling on one process; single-flight execution bounds that contention, and the same Student Workspace job contract lets a future ADR move the worker to a durable queue or external runner without re-deciding the safety boundary.

Driving execution by an explicit authenticated trigger makes the deploy smoke deterministic and keeps execution observable, at the cost of requiring an operational caller (the deploy job, an interval, or an operator) rather than an always-on loop.

Keeping raw artifacts non-persistent preserves ADR-015's leakage protections through a real model path and keeps backups and feedback clean, at the cost of reduced post-hoc debugging visibility; a later ADR may introduce a redaction-governed artifact store if debugging need is demonstrated.

Env-only credentials keep operational secrets out of product data and backups and satisfy the dedicated-key rule, at the cost of requiring the admin to provision and rotate Agonara's Nomos key on the host.

## Non-Goals

This ADR does not decide:

- prompt template text, context-window strategy, temperature, or model-routing policy;
- the specific Nomos project, base URL, or model identifier backing Agonara's evaluator;
- HTTP route names, request/response payloads, or status codes for the operational trigger;
- database tables, columns, migrations, or storage layout for usage summaries;
- the optional interval's cadence or scheduler implementation;
- durable queue technology, broker configuration, or external runner design (explicitly deferred);
- a raw-artifact retention/redaction store (explicitly kept out; raw artifacts remain non-persistent);
- the curator-suggestion provider path's move from stub to real provider (related but separately specified);
- deterministic evaluator rule content;
- bootstrap-secret or key rotation procedure (an operational concern under ADR-017).
