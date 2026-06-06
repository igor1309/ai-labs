---
date: 2026-06-06
model: gpt-5
description: "Implementation plan: implement ADR-018 real Nomos provider runtime for the open-answer evaluator."
---

# Open-Answer Evaluator Real-Provider Runtime

## Goal

Implement ADR-018 and the draft real-provider runtime spec so deployed Agonara can run one authenticated, single-flight open-answer evaluator tick through the Nomos gateway without persisting or surfacing credentials or raw evaluator artifacts.

## Execution mode

```
Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: no push
```

## Execution lock

```
Worktree mode: none
Expected worktree: /Users/igormalyarov/.codex/worktrees/a321/ai-labs
Expected branch: codex/agonara-adr018-runtime
Preflight check: [x] done
```

## Scope guardrails

- Do not register Agonara as a release unit, bump its release version, add deploy jobs, or push an `agonara_v*` tag.
- Do not introduce a durable queue, separate worker process, scheduler, raw-artifact store, or curator-suggestion real-provider migration.
- Do not choose production hostnames, DNS/TLS ownership, backup tooling, Nomos model routing, or key rotation policy.
- Keep credentials runtime-only; tests must use injected fakes and must not require live Nomos access.

## ADR traceability matrix

| ADR-018 invariant | Phase |
| --- | --- |
| Real provider adapter calls Nomos over HTTP and satisfies ADR-015 adapter boundaries | Phase 1 |
| Real output is validated before acceptance and rejects malformed/unsafe criterion feedback | Phase 1 |
| Raw prompts, responses, and provider payloads are not persisted, logged, or surfaced | Phase 1, Phase 3 |
| Provider config is env-only at the composition root | Phase 3 |
| Worker runs in-process, single-flight, via authenticated operational trigger | Phase 2, Phase 3 |
| Missing provider env preserves current `providerAdapters: []` behavior | Phase 3 |

## Phase 1 — Nomos adapter and policy

- **Objective**: Add a Nomos-backed provider adapter and LLM evaluator policy helper with focused tests.
- **Key work items**: create the runtime module; validate config; call `POST /v1/chat/completions` with bearer auth; parse JSON model output; validate criterion feedback, summary, usage, and forbidden operational details; return secret-free provider usage.
- **Dependencies**: ADR-018 and the real-provider runtime spec.
- **Risks**: leaking raw prompt/response in returned values or errors; accepting extra or unknown criterion feedback.
- **Validation**: targeted runtime tests for construction, request shape, valid output, invalid output, non-2xx/malformed failures, and policy shape.
- **Completion signal**: adapter and policy tests pass without live network access.

## Phase 2 — Async-compatible single-flight worker tick

- **Objective**: Preserve existing synchronous fake-adapter behavior while supporting async real-provider calls and single-flight operational ticks.
- **Key work items**: make `runOpenAnswerEvaluatorWorkerOnce` continue synchronously for sync adapters and return a promise for async adapters; add a single-flight tick wrapper that invokes `claim_next` exactly once and rejects overlapping ticks.
- **Dependencies**: Phase 1.
- **Risks**: breaking existing deterministic worker tests; leaving the in-flight latch set after failure.
- **Validation**: existing Student Workspace worker tests remain green; new async worker/tick tests cover successful async completion and overlapping invocation rejection.
- **Completion signal**: sync and async worker paths both pass targeted tests.

## Phase 3 — Server composition and operational trigger

- **Objective**: Wire the runtime into `startServer` and expose an authenticated internal trigger only when real-provider configuration is complete.
- **Key work items**: read `AGONARA_NOMOS_BASE_URL`, `AGONARA_NOMOS_MODEL`, `AGONARA_NOMOS_API_KEY`, and optional trigger token from runtime env/options; inject the adapter and policy into Student Workspace; add `POST /operations/open-answer-evaluator/tick` guarded by operations-access session or bearer trigger token; keep the route absent when provider env is incomplete.
- **Dependencies**: Phase 2.
- **Risks**: token or provider config leaking into health/logs; ordinary product sessions triggering feedback authoring.
- **Validation**: operations HTTP tests for missing route when env incomplete, unauthenticated rejection, token/session authorization, and no credential leakage in health/log responses.
- **Completion signal**: server composition tests and operations tests pass.

## Phase 4 — Governance closeout

- **Objective**: Mark the spec implemented and align handoff/log artifacts with the actual ADR-018 implementation state.
- **Key work items**: update spec status and done criteria references; remove stale handoff open questions for resolved ADR-018 items; add concise log entries.
- **Dependencies**: Phases 1-3.
- **Risks**: claiming deployment readiness or release readiness prematurely.
- **Validation**: Markdown front matter/structure check; full root tests and build.
- **Completion signal**: docs describe ADR-018 as implemented while release/deployment wiring remains explicitly pending.

## Done criteria

- The Nomos provider adapter, LLM evaluator policy, single-flight tick, server composition wiring, and authenticated operational trigger are implemented.
- Provider credentials and raw evaluator artifacts are absent from persisted records, health responses, logs, run summaries, and returned provider results.
- Missing provider env preserves the current no-real-provider behavior.
- Targeted tests, root tests, and build pass through the repo wrapper.
- Release-unit registration and deployment wiring remain untouched.

## Final closeout

```
Final gates: ./scripts/run_silent.sh "tests" npm test; ./scripts/run_silent.sh "build" npx tsc --noEmit
Archive plan: move to agonara/docs/plans/implemented/
Commit archive move: yes
Push/PR: follow push policy
```
