---
date: 2026-06-02
model: gpt-5
description: "Decision for Agonara Student Workspace open-answer evaluator orchestration and job ownership."
status: accepted
---

# ADR-014 - Student Workspace Open-Answer Evaluator Orchestration

## Executive Summary

Agonara treats open-answer evaluator orchestration as a Student Workspace-governed job boundary.

Student Workspace owns evaluator job identity, attempt locking, lease state, retry eligibility, cancellation, timeout recovery, and final transition acceptance.

Evaluator workers may run in-process, in a durable queue, or in a later external runner, but they do not own final learner state.

Provider calls and human-review handoffs must execute through idempotent evaluator jobs with explicit attribution, leases, failures, and evidence redaction.

Long-running evaluation must not depend on a web request remaining alive.

This ADR decides orchestration ownership and invariants. It does not choose queue technology, LLM provider, prompt design, UI, deployment topology, or concrete API payloads.

## Context

[ADR-011](adr-011-accepted-checks-and-student-assessment-boundary.md) assigns student attempts, feedback, evidence, mastery state, weak-area state, review state, and learning history to Student Workspace.

[ADR-012](adr-012-student-workspace-open-answer-attempt-lifecycle.md) establishes open-answer attempts and separates submission from evaluation completion.

[ADR-013](adr-013-student-workspace-open-answer-evaluation-governance.md) establishes that evaluator paths are governed by Student Workspace and that long-running evaluation must be explicit.

The implemented Student Workspace slices now record submitted attempts, internal evaluation outcomes, active failures, evaluator runs, redacted internal evidence metadata, owner-only status reads, and backup/restore validation. The remaining architectural tension is orchestration. Once evaluation can involve LLM calls, deterministic rubric execution, cancellation, retries, timeout recovery, or human review, Agonara needs a stable owner for work identity and lifecycle control before implementing provider integration.

If orchestration is hidden inside an HTTP request, clients cannot reliably observe status or recover from timeouts. If provider workers directly mutate feedback, Student Workspace loses control over final learner state. If retries are provider-level rather than job-level, duplicate final evaluations and duplicate cost can occur. If leases and cancellation are implicit, stuck work can leave attempts permanently `evaluating`. If human review is treated as an Admin or Curator operation, operational or curation authority leaks into personal student assessment.

The rejected alternatives are synchronous provider execution as the ordinary evaluation model, provider-owned final feedback writes, an Admin-owned operational recovery queue, a Program Curator-owned review queue, and selecting a queue or worker technology before the orchestration boundary is decided. Those alternatives either violate existing ownership ADRs or decide deployment mechanics before the architectural contract is stable.

Industry reference points support this boundary without requiring a specific implementation. Long-running work is commonly modeled as asynchronous request-reply rather than hidden synchronous execution. Distributed job systems commonly use explicit idempotency, leases, retry limits, and terminal states to make recovery observable. LLM-backed workflows require prompt-injection handling, output validation, redaction, and cost controls before model output affects user state. These practices guide the decision, but Agonara's concrete transport, queue, and provider choices belong in later specs and implementation plans.

## Decision

Agonara MUST model open-answer evaluator orchestration as Student Workspace-owned evaluator jobs.

An evaluator job MUST be linked to exactly one open-answer attempt and to the attempt's Program, Student Identity, accepted open-answer check revision, and accepted criterion revision identifiers.

Student Workspace MUST own job creation, running-state admission, lease state, cancellation, retry eligibility, timeout recovery, failure recording, and final transition acceptance.

Evaluator workers MAY be in-process workers, durable queue consumers, scheduled recovery workers, external provider adapters, or human-review adapters, but they MUST act through Student Workspace orchestration rules.

Evaluator workers MUST NOT directly create final student-facing feedback, mastery state, weak-area state, progress state, accepted corpus state, Program Membership state, Identity state, session state, or CSRF state outside Student Workspace evaluation commands.

Every long-running evaluator job MUST have an explicit observable status and failure state.

Every running evaluator job MUST have a lease or equivalent ownership claim before work that can outlive the initiating request begins.

Every evaluator job retry MUST be idempotent at the Student Workspace job boundary.

Retry, cancellation, timeout recovery, and human-review handoff MUST preserve the original submitted answer and accepted revision references.

Provider calls, prompt construction, model output validation, raw artifact retention, and cost policy MUST be specified before an LLM-assisted worker is implemented.

Human-review orchestration MAY be introduced later, but reviewer assignment and reviewer authority MUST remain evaluator capabilities rather than inherited Admin or Program Curator authority.

Queue technology, worker process topology, deployment target, provider choice, and concrete API payloads remain lower-layer decisions constrained by this ADR.

## Rules / Invariants

- Student Workspace owns open-answer evaluator job identity.
- Student Workspace owns open-answer evaluator job lifecycle state.
- Student Workspace owns evaluator job retry eligibility.
- Student Workspace owns evaluator job cancellation state.
- Student Workspace owns evaluator job timeout recovery state.
- Student Workspace owns final acceptance of evaluator results into student-facing feedback.
- An evaluator job MUST reference exactly one open-answer attempt.
- An evaluator job MUST snapshot the attempt's Program identifier, Student Identity identifier, accepted check revision identifier, and accepted criterion revision identifiers.
- An evaluator job MUST NOT change its snapshotted attempt, Program, Student Identity, accepted check revision, or accepted criterion revision identifiers after creation.
- At most one active evaluator job MAY hold the attempt's evaluating slot at a time.
- Evaluator job creation MUST NOT create a duplicate attempt.
- Evaluator job retry MUST NOT create a duplicate attempt for the same submitted answer.
- Evaluator job retry MUST NOT create duplicate final student-facing evaluations for the same successful job result.
- Evaluator job retries MUST have an idempotency boundary controlled by Student Workspace.
- A running evaluator job MUST have an explicit lease, claim, or equivalent ownership token before worker execution begins.
- Lease expiry MUST make stalled evaluator work recoverable without deleting the submitted answer.
- Timeout recovery MUST preserve the submitted answer and accepted revision references.
- Cancellation MUST preserve the submitted answer and accepted revision references.
- Failure recording MUST preserve the submitted answer and accepted revision references.
- A worker MUST revalidate that the evaluator job is still active before recording evidence, failure, cancellation, or completion.
- A worker MUST NOT complete a job after cancellation, terminal failure, timeout recovery, or superseding retry has made that job inactive.
- Provider adapters MUST NOT directly mutate final feedback outside Student Workspace evaluation commands.
- Human-review adapters MUST NOT directly mutate final feedback outside Student Workspace evaluation commands.
- Raw prompts, raw model responses, provider diagnostics, reviewer notes, stack traces, SQL text, filesystem paths, database URLs, secrets, session identifiers, CSRF tokens, cookie headers, and authorization headers MUST remain separated from student-facing feedback.
- LLM-assisted workers MUST treat student answers, accepted corpus content, and provider outputs as untrusted input.
- LLM-assisted workers MUST have explicit output validation before any model output is accepted as feedback.
- LLM-assisted workers MUST have explicit redaction rules before raw or summarized evidence is persisted.
- LLM-assisted workers MUST have explicit budget, retry, and cost controls before provider calls are implemented.
- Human-review orchestration MUST preserve reviewer Identity and reviewer capability attribution when it accepts final feedback.
- Admin authority MUST NOT be sufficient to claim, complete, retry, or rewrite ordinary evaluator jobs through product flows.
- Program Curator authority MUST NOT be sufficient to claim, complete, retry, or rewrite ordinary evaluator jobs through curator flows.
- Operational recovery MAY be introduced only if it preserves Student Workspace ownership, auditability, and private attempt boundaries.
- Queue technology MUST be replaceable without changing attempt ownership, final feedback ownership, or accepted revision references.
- Worker topology MUST be verified from deployment docs or configuration before implementation; specs and plans MUST NOT assume shared processes, shared hosts, ports, or filesystems.
- Specs and implementation plans for evaluator orchestration MUST include tests or review checks for idempotency, active-job conflicts, lease expiry, retry eligibility, cancellation, timeout recovery, attribution, redaction, provider-output validation, cost guardrails, and absence of Admin or Program Curator feedback-authoring shortcuts.

## Consequences

Student Workspace gets one stable orchestration boundary for deterministic, LLM-assisted, and human-reviewed evaluation paths.

Provider integration can be implemented later without letting provider adapters become product-state owners.

Explicit leases, retries, cancellation, and timeout recovery add storage and state-machine complexity, but they prevent stuck `evaluating` attempts and make failures observable.

Idempotent job retries reduce duplicate feedback and duplicate provider cost, but they require careful result acceptance rules and terminal-state checks.

Human review remains possible without turning Admin or Program Curator authority into ordinary feedback-authoring authority.

LLM provider work is intentionally blocked until a spec decides provider calls, prompt construction, output validation, evidence retention, redaction, and budget controls.

The queue or worker implementation can start small, including an in-process runner, as long as it preserves the same Student Workspace job boundary and does not rely on long-running HTTP requests.

A later ADR MAY introduce a standalone Assessment module or external orchestration service only if it preserves Corpus Storage ownership of accepted corpus and Student Workspace ownership of personal learner state, or explicitly amends those boundaries.

## Non-Goals

This ADR does not decide:

- concrete database tables, columns, migrations, indexes, or storage layout;
- HTTP route names, request payloads, response payloads, status codes, or polling contract;
- queue technology, queue schema, broker configuration, worker library, scheduler library, or lock implementation;
- whether the first implementation uses an in-process worker, a durable queue, a cron-like scheduler, or an external runner;
- LLM provider, model, embedding model, prompt template, context assembly, token budget, temperature, model-routing policy, or provider credential handling;
- concrete prompt-injection mitigations beyond requiring future specs to treat inputs and outputs as untrusted;
- raw artifact retention duration, deletion policy, legal compliance policy, or export policy;
- human review queue UI, reviewer assignment, escalation, dispute workflow, reviewer compensation, or reviewer staffing;
- Student UI, Admin UI, Curator UI, reviewer UI, Program UI, or generated frontend artifacts;
- mastery calculation, weak-area calculation, progress interpretation, review scheduling, next-step recommendation, grading, analytics, reporting, certification, classroom, cohort, or institutional workflows;
- plagiarism detection, proctoring, identity verification during attempts, exam integrity, or academic misconduct workflow;
- a standalone Assessment module;
- CLI commands.
