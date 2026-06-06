---
date: 2026-06-02
model: gpt-5
description: "Decision for Agonara open-answer evaluator worker and provider execution boundaries."
status: accepted
---

# ADR-015 - Open-Answer Evaluator Worker and Provider Boundary

> **Amended by [ADR-018](adr-018-open-answer-evaluator-real-provider-runtime.md).**
> ADR-018 decides the non-goals this ADR deferred — worker runtime topology,
> the requirement for a concrete validated output schema, the real-path
> raw-artifact policy, and the provider credential mechanism — without
> altering any invariant below.

## Executive Summary

Agonara treats evaluator workers and provider adapters as execution agents behind the Student Workspace evaluator job boundary.

Student Workspace remains the owner of evaluator jobs, final feedback acceptance, learner state, and restore-safe evidence summaries.

Workers may construct prompts, call deterministic or LLM providers, validate outputs, and prepare candidate results only under an explicit evaluator policy.

Provider adapters must not own job lifecycle state, final learner state, accepted corpus, credentials, secrets, or product authorization.

Raw evaluator artifacts are operational evidence with explicit retention and redaction policy, not student-facing feedback or backup payload by default.

This ADR decides execution ownership, artifact boundaries, and provider safety invariants. It does not choose a queue, model provider, prompt template, UI, deployment topology, or concrete API payloads.

## Context

[ADR-011](adr-011-accepted-checks-and-student-assessment-boundary.md) assigns accepted checks and criteria to Corpus Storage while keeping attempts, feedback, evidence, mastery state, weak-area state, review state, and learning history in Student Workspace.

[ADR-013](adr-013-student-workspace-open-answer-evaluation-governance.md) establishes that deterministic, LLM-assisted, and human-reviewed evaluation paths act under Student Workspace governance.

[ADR-014](adr-014-student-workspace-open-answer-evaluator-orchestration.md) establishes Student Workspace-owned evaluator jobs with leases, retries, cancellation, timeout recovery, and final transition acceptance.

This ADR uses `evaluator worker` for code that claims an evaluator job and executes work under that job's lease. It uses `provider adapter` for the narrow integration code that calls an external LLM, deterministic engine, or future review execution service and returns bounded execution results to the worker. It uses `evaluator policy` for the versioned rule set that constrains prompt inputs, output schema, validation, budget, retry, redaction, and raw-artifact handling for one evaluator path. It uses `raw evaluator artifacts` for prompt transcripts, raw model responses, provider request/response payloads, provider diagnostics, reviewer notes, hidden policy instructions, and similarly sensitive execution details before redaction or normalization.

The implemented evaluator orchestration slice now gives Agonara a job boundary: jobs can be scheduled, claimed, renewed, supplied with redacted evidence, completed idempotently, failed, retried, cancelled, timed out, backed up, and restored. The next architectural tension is execution. A worker can now claim a job, but Agonara has not decided where prompt construction, provider calls, output validation, raw artifact retention, and provider-cost attribution belong.

If provider adapters directly complete evaluations, provider code becomes an unreviewed owner of learner state. If raw prompts or model responses are stored as ordinary Student Workspace records, backup/export and student-facing feedback can leak secrets, hidden policy instructions, private answers, provider diagnostics, or prompt-injection payloads. If each worker invents its own prompt, validation, retry, or budget rules, repeated jobs become non-idempotent and difficult to audit. If provider credentials enter domain records or backups, operational secrets become product data.

The rejected alternatives are letting provider adapters own final feedback writes, treating raw model artifacts as normal evaluator evidence, embedding provider credentials in Student Workspace records, allowing workers to bypass evaluator job leases, and selecting queue or model infrastructure before the execution boundary is stable. Those alternatives either violate existing Student Workspace ownership ADRs or decide deployment mechanics before the safety contract is clear.

Industry reference points support the boundary. Long-running work should use explicit job state rather than hidden request lifetimes. LLM-backed systems need prompt-injection handling, output validation, sensitive-information controls, retry/cost controls, and auditability before model output affects user state. These practices guide Agonara's constraints, while concrete provider, queue, and prompt choices remain lower-layer decisions.

## Decision

Agonara MUST treat evaluator workers as execution agents that operate through Student Workspace evaluator jobs.

Evaluator workers MUST claim a Student Workspace evaluator job before constructing prompts, calling providers, recording evidence, failing, retrying, cancelling, timing out, or completing the job.

Evaluator workers MUST revalidate the active lease, worker identity, and job state immediately before recording evidence, failure, retry intent, timeout, cancellation, or completion.

Evaluator workers MAY use deterministic rules, LLM provider adapters, or human-review adapters, but they MUST submit candidate evidence and candidate final results through Student Workspace evaluator commands.

Student Workspace MUST remain the only owner that accepts candidate evaluator results into final student-facing feedback, final evaluation records, or learner-state inputs.

Provider adapters MUST be side-effect-limited. A provider adapter MAY call an external service and return provider output, provider usage, and provider diagnostics to the worker boundary, but it MUST NOT mutate Student Workspace records, Corpus Storage records, Program Membership state, Identity state, sessions, CSRF state, credentials, or backup payloads.

Prompt construction MUST be governed by an evaluator policy that names the accepted check revision, accepted criterion revision identifiers, prompt inputs, redaction rules, output schema, validation rules, provider budget policy, retry policy, and raw-artifact handling class.

LLM provider output MUST be treated as untrusted until it passes explicit output validation. Invalid output MUST NOT become final feedback or downstream learner-state input.

Raw prompts, raw model responses, provider diagnostics, provider request identifiers, provider latency, reviewer notes, hidden policy instructions, stack traces, SQL text, filesystem paths, database URLs, secrets, session identifiers, CSRF tokens, cookie headers, and authorization headers MUST NOT be student-facing feedback.

Raw evaluator artifacts MAY be retained only under an explicit internal artifact policy that defines retention duration, export behavior, backup behavior, redaction obligations, access boundary, and deletion behavior.

Until a later spec defines that artifact policy, raw evaluator artifacts MUST NOT be persisted in ordinary Student Workspace records, exported in identity backups, restored from identity backups, or surfaced through job/evidence/final-feedback summaries.

Provider credentials MUST remain operational configuration or secret material. They MUST NOT be stored in Student Workspace job records, Corpus Storage records, backup payloads, evaluator evidence summaries, or product logs.

Provider usage and cost metadata MAY be recorded as normalized non-secret usage summaries when needed for budget enforcement, idempotency checks, audit, or operator diagnosis.

Worker retry behavior MUST be driven by Student Workspace job retry policy. Provider-level retries MAY happen inside one worker attempt only if they stay within the job's budget policy and do not create duplicate final evaluations.

Human-review adapters MAY participate later, but reviewer assignment, reviewer capability, raw reviewer notes, and final acceptance MUST preserve ADR-013 and ADR-014 attribution and ownership rules.

Queue technology, worker process topology, provider choice, prompt template text, model routing, and deployment target remain lower-layer decisions constrained by this ADR.

## Rules / Invariants

- Student Workspace owns evaluator jobs.
- Student Workspace owns final student-facing evaluator result acceptance.
- Evaluator workers are execution agents, not product-state owners.
- Provider adapters are execution adapters, not product-state owners.
- A worker MUST claim an evaluator job before provider execution begins.
- A worker MUST hold a valid active lease before recording evaluator evidence.
- A worker MUST hold a valid active lease before completing an evaluator job.
- A worker MUST hold a valid active lease before recording retryable or terminal provider failure.
- A worker MUST NOT complete a cancelled, timed-out, terminally failed, succeeded, or superseded job.
- A provider adapter MUST NOT directly mutate final feedback.
- A provider adapter MUST NOT directly mutate accepted corpus.
- A provider adapter MUST NOT directly mutate Program Membership state.
- A provider adapter MUST NOT directly mutate Identity, session, credential, CSRF, or Admin authority state.
- Prompt construction MUST use accepted check and criterion revision identifiers snapshotted on the evaluator job.
- Prompt construction MUST NOT read mutable draft curator state as if it were accepted corpus.
- Prompt construction MUST treat the submitted answer, accepted corpus content, provider output, and reviewer notes as untrusted input.
- Prompt construction MUST keep hidden policy instructions separate from student-facing feedback and backup payloads.
- LLM output MUST pass explicit schema and content validation before Student Workspace can accept it as final feedback.
- Output validation MUST reject missing required criterion feedback, unknown criterion revision identifiers, malformed provider usage, unsafe summaries, and forbidden operational details.
- Provider usage summaries MUST be normalized before persistence.
- Provider usage summaries MUST NOT contain provider credentials, authorization headers, raw request payloads, raw response payloads, cookies, session identifiers, filesystem paths, stack traces, SQL text, database URLs, or hidden policy instructions.
- Provider budget policy MUST bound provider calls for each evaluator job.
- Provider budget policy MUST bound accepted provider usage summaries before completion.
- Provider retries inside one worker attempt MUST count against the evaluator job budget.
- Student Workspace job retry policy MUST remain the owner of cross-attempt retry eligibility.
- Equivalent repeated completion MUST remain idempotent across provider-backed jobs.
- A materially different repeated completion MUST be rejected or leave the original final evaluation unchanged.
- Raw evaluator artifacts MUST NOT be persisted unless a later spec defines an explicit internal artifact policy.
- Raw evaluator artifacts MUST NOT appear in identity backup export unless a later ADR or spec explicitly changes the backup contract.
- Restore MUST reject evaluator records that include raw evaluator artifact fields or unsafe artifact summaries.
- Logs MAY record job identifiers, provider kind, non-secret usage summaries, status, duration, and coarse failure reasons.
- Logs MUST NOT record raw prompts, raw model responses, provider credentials, authorization headers, cookies, CSRF tokens, session identifiers, hidden policy instructions, SQL text, stack traces, filesystem paths, or database URLs.
- Human-review adapter output MUST preserve reviewer Identity and reviewer capability attribution before final acceptance.
- Admin authority MUST NOT by itself grant ordinary evaluator-worker or reviewer capability.
- Program Curator authority MUST NOT by itself grant ordinary evaluator-worker or reviewer capability.
- Specs and implementation plans for evaluator workers MUST include tests or review checks for lease validation, provider side-effect isolation, output validation, budget enforcement, idempotent completion, raw-artifact exclusion, credential exclusion, log redaction, backup/restore rejection of forbidden artifacts, and absence of Admin or Program Curator feedback-authoring shortcuts.

## Consequences

Agonara can add a first executable evaluator worker without giving provider code ownership of learner state.

The worker boundary can start in-process and later move to a durable queue or external runner while preserving the same Student Workspace job contract.

Prompt construction becomes a governed policy concern rather than ad hoc worker code. That adds specification work, but it makes accepted revision references, output validation, redaction, and cost controls reviewable before provider calls are implemented.

Provider adapters stay replaceable because they return bounded execution results instead of mutating domain state.

Raw artifact retention is intentionally blocked until a separate policy decides retention, backup/export, redaction, access, and deletion behavior. This reduces debugging visibility at first, but prevents accidental leakage through backups, logs, or feedback summaries.

Provider cost and retry behavior become part of the job contract. That reduces duplicate spend and duplicate final feedback, but it requires normalized usage summaries and idempotent completion checks.

Human review remains compatible with the evaluator path model without turning Admin or Program Curator authority into ordinary feedback-authoring authority.

A later ADR MAY introduce an operational artifact store, human-review workflow, model-routing policy, or standalone Assessment module only if it preserves Corpus Storage ownership of accepted corpus and Student Workspace ownership of personal learner state, or explicitly amends those boundaries.

## Non-Goals

This ADR does not decide:

- concrete database tables, columns, migrations, indexes, or storage layout;
- HTTP route names, request payloads, response payloads, status codes, polling contract, or worker API payloads;
- queue technology, queue schema, broker configuration, scheduler implementation, worker library, lock library, or lease storage mechanism;
- whether the first worker runs in-process, in a separate process, in a durable queue consumer, in a cron-like scheduler, or in an external runner;
- LLM provider, model, embedding model, prompt template text, context-window strategy, temperature, model-routing policy, provider SDK, or provider credential mechanism;
- concrete deterministic evaluator rules;
- concrete output schema beyond requiring later specs to define and validate one;
- raw artifact retention duration, deletion schedule, legal compliance policy, or operator access UI;
- human review queue, reviewer assignment algorithm, reviewer UI, escalation, dispute workflow, reviewer compensation, or staffing model;
- Student UI, Admin UI, Curator UI, reviewer UI, Program UI, or generated frontend artifacts;
- mastery calculation, weak-area calculation, progress interpretation, review scheduling, next-step recommendation, grading, analytics, reporting, certification, classroom, cohort, or institutional workflows;
- plagiarism detection, proctoring, identity verification during attempts, exam integrity, or academic misconduct workflow;
- a standalone Assessment module;
- CLI commands.
