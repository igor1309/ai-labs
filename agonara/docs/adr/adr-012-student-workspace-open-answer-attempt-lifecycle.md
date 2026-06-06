---
date: 2026-06-01
model: gpt-5
description: "Decision for Agonara Student Workspace open-answer attempt and evaluation lifecycle."
status: accepted
---

# ADR-012 - Student Workspace Open-Answer Attempt Lifecycle

## Executive Summary

Agonara records open-answer attempts and their evaluation outcomes in Student Workspace.

Each attempt references the accepted open-answer check revision and accepted criterion revisions used for that attempt.

Student Workspace owns the submitted answer, evaluation lifecycle, feedback, and student-specific evidence.

Corpus Storage remains the owner of accepted checks and criteria; attempts must not copy ownership of accepted corpus.

The next first-slice spec is narrowed to open-answer attempts before mastery, weak-area, topic-level, quick-check, UI, or Admin behavior.

Evaluation may be synchronous, queued, deterministic, LLM-assisted, or human-reviewed later, but Student Workspace remains the owner of final student-facing outcomes.

## Context

[ADR-010](adr-010-corpus-storage-and-curator-acceptance-boundary.md) establishes Corpus Storage ownership of accepted Program corpus and stable accepted revisions.

[ADR-011](adr-011-accepted-checks-and-student-assessment-boundary.md) establishes accepted checks and assessment criteria as Corpus Storage state while assigning student attempts, submitted answers, feedback, evidence, mastery state, weak-area state, review state, and learning history to Student Workspace.

The accepted checks and assessment criteria first slice now gives Student Workspace stable accepted open-answer check revision identifiers and criterion revision identifiers to reference when recording attempts.

The [Student User Stories](../intent/student_user_stories.md) require students to submit open answers and receive feedback. The [Product Intent](../intent/intent_learning_program_app.md) requires personal attempts and feedback to remain separate from accepted Program corpus.

The architectural tension is that open-answer evaluation depends on accepted Program content but produces personal student evidence. If attempts embed mutable check or criterion content, attempts can drift away from accepted revisions. If evaluation outcomes live in Corpus Storage, accepted corpus is polluted with personal state. If the first slice introduces full mastery, weak-area calculation, LLM orchestration, or human review workflow, it decides too many assessment policies before the attempt boundary is proven.

The rejected alternatives are storing attempts in Corpus Storage, copying accepted check and criterion bodies into attempts as the ownership record, making LLM output final feedback without Student Workspace acceptance, and introducing a standalone Assessment module now. Storing attempts in Corpus Storage violates ADR-011. Copying bodies as ownership records weakens revision traceability. Treating LLM output as final feedback bypasses Student Workspace rules. A standalone Assessment module remains possible later, but the first attempt slice can prove the lifecycle inside Student Workspace without adding a new top-level owner.

Industry reference points support this shape without forcing implementation detail. [Idempotent mutation keys](https://docs.stripe.com/api/idempotent_requests) are a common protection for retryable POST operations. [Asynchronous request-reply](https://learn.microsoft.com/en-us/azure/architecture/patterns/async-request-reply) is appropriate only when evaluation cannot complete promptly. [Event sourcing](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing) can provide auditability, but it is a high-complexity pattern and should not be adopted before append-only attempt/evaluation records prove insufficient. [Generative AI risk guidance](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence) supports explicit governance, evaluation records, and human oversight thresholds when LLM assistance is used.

## Decision

Agonara MUST record student open-answer attempts in Student Workspace.

An open-answer attempt MUST be scoped to one stable `Program`, one acting internal `Identity` with effective `Student` participation, and one accepted open-answer check revision.

At submission time, Student Workspace MUST resolve the accepted open-answer check revision through Corpus Storage and snapshot the criterion revision identifiers referenced by that check revision.

Student Workspace MUST store the submitted answer as student-owned state.

Student Workspace MUST NOT mutate accepted checks, accepted criteria, accepted revisions, or curator candidate state when an attempt is submitted, evaluated, retried, or viewed.

Student Workspace MUST expose an attempt lifecycle that separates answer submission from evaluation completion.

The minimum lifecycle states are `submitted`, `evaluating`, `evaluated`, and `evaluation_failed`.

Submission MUST be idempotent for client retries. The idempotency boundary is the acting student, Program, accepted check revision, and client-provided idempotency key.

Evaluation outcomes MUST be stored as Student Workspace state linked to the attempt and to the accepted check and criterion revisions used.

Feedback presented to the student MUST identify its basis in the accepted criterion revisions used for evaluation.

LLM-assisted evaluation MAY produce draft observations, but those observations MUST NOT become final feedback, mastery state, weak-area state, or progress evidence until Student Workspace records an evaluation outcome under its rules.

Human review MAY be introduced later as an evaluation path, but this ADR does not require a human review workflow in the first slice.

Admin authority MUST NOT by itself submit attempts, evaluate student answers, or rewrite feedback through ordinary product flows.

Program Curator authority MUST NOT by itself submit attempts or rewrite student evaluation outcomes through ordinary curator flows.

## Rules / Invariants

- Student Workspace owns open-answer attempts.
- Student Workspace owns submitted answers.
- Student Workspace owns evaluation outcomes, feedback, and student-specific assessment evidence.
- Corpus Storage owns accepted open-answer checks and accepted assessment criteria.
- Program Membership owns effective `Student` participation used to authorize attempt submission and attempt reads.
- Identity & Role Management owns the acting internal `Identity` and Admin authority; it MUST NOT own attempts, answers, feedback, or progress interpretation.
- An open-answer attempt MUST reference the accepted open-answer check revision used for the attempt.
- An open-answer attempt MUST reference the accepted assessment criterion revisions used for evaluation.
- An open-answer attempt MUST preserve the submitted answer text that was evaluated.
- Attempt submission MUST require effective `Student` participation for the Program.
- First-slice attempt reads MUST require the owning student.
- Later ADRs MAY introduce reviewer, recovery, or support reads only if those reads preserve Student Workspace ownership and auditability.
- Attempt submission MUST reject accepted check revisions that do not belong to the requested Program.
- Attempt submission MUST reject unknown accepted check revisions and draft or rejected check candidate identifiers as submission targets.
- Attempt submission MUST NOT accept a mutable check entity identifier as the sole evaluation target.
- Attempt submission MUST use an accepted check revision identifier or an API operation that resolves a current accepted check entity to a concrete revision before persisting the attempt.
- Attempt submission MUST snapshot the criterion revision identifiers from the accepted check revision at submission time.
- Later changes to accepted checks or accepted criteria MUST NOT rewrite prior attempts or evaluation outcomes.
- Candidate rejection or cleanup MUST NOT delete attempts or evaluation outcomes that reference accepted revisions.
- Submitted answer text MUST be immutable after submission.
- Corrective feedback, evaluator notes, and evaluation status changes MUST be stored as new evaluation state or explicit state transitions, not as edits to the submitted answer.
- Retryable submission APIs MUST require a client-provided idempotency key and MUST return the same attempt result for repeated equivalent submissions under the same key.
- Reusing an idempotency key with materially different submission input MUST be rejected without creating or changing an attempt.
- Idempotency keys MUST be scoped so one student cannot collide with or observe another student's submission.
- Idempotency keys MUST NOT be treated as authentication or authorization tokens.
- Evaluation may be synchronous only when it can complete within the normal request/response budget without hiding long-running work.
- Long-running evaluation MUST use an asynchronous status resource, queued work, or another explicitly specified asynchronous workflow.
- Evaluation failure MUST preserve the submitted attempt and record a failure state that can be retried or inspected.
- Evaluation retries MUST NOT create duplicate attempts for the same idempotent submission.
- LLM prompts, raw model responses, model metadata, and evaluator diagnostics MAY be recorded as evaluation evidence later, but MUST be redacted from student-facing feedback unless explicitly allowed by a future spec.
- LLM-generated feedback MUST be attributable to the evaluation path and MUST remain bounded by Student Workspace rules.
- Human-reviewed feedback, if added later, MUST remain Student Workspace state and MUST reference the same attempt and accepted revision identifiers.
- Mastery state, weak-area state, review scheduling, and progress interpretation MUST consume evaluation outcomes later; they MUST NOT be introduced as hidden side effects of first-slice attempt submission.
- Attempt and evaluation APIs MUST preserve the existing session, CSRF, envelope, pagination, and redaction conventions used by current Agonara HTTP APIs.
- Fault responses and student-facing responses MUST NOT expose password hashes, plaintext passwords, bootstrap secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, raw LLM prompts, raw model responses, SQL text, stack traces, filesystem paths, database URLs, or infrastructure details.
- Backup and restore behavior for attempts and evaluation outcomes MUST preserve accepted revision references and MUST reject restored states that orphan attempts from required Program, Identity, or accepted revision records.
- Specs and implementation plans for this boundary MUST include tests proving attempts reference accepted revisions, accepted corpus is not mutated, idempotent submission does not duplicate attempts, and failed evaluation does not delete submitted answers.

## Consequences

Student Workspace can now implement the first real learner assessment behavior without weakening the accepted corpus boundary.

Using accepted revision identifiers protects historical attempts when curators later improve checks or criteria.

Separating submission from evaluation lets the first implementation start with a simple evaluator while leaving room for queues, LLM assistance, or human review when those needs are concrete.

Idempotent submissions add storage and API contract complexity, but they prevent duplicate attempts when browsers, mobile clients, or reverse proxies retry requests.

Keeping submitted answers immutable makes evaluation history easier to reason about. Corrections require a new attempt or explicit evaluation state, which is stricter than editing in place.

Avoiding full event sourcing keeps the first slice small. If later audit, replay, or analytics needs exceed simple append-only attempt/evaluation records, a new ADR can introduce an event-sourced model.

LLM assistance remains useful without becoming the owner of final feedback. The system can record model-generated observations as evidence while preserving Student Workspace control over student-facing outcomes.

This ADR narrows the next spec to open-answer submission and evaluation lifecycle. It does not require UI, Admin tools, mastery interpretation, weak-area calculation, topic-level checks, quick checks, or a standalone Assessment module.

## Non-Goals

This ADR does not decide:

- concrete database tables, columns, migrations, or storage layout;
- HTTP route names or request/response payloads;
- UI behavior for Student Workspace, Curator Workspace, or Admin operations;
- scoring algorithms, rubric math, grade scales, mastery thresholds, or weak-area calculation;
- topic-level, period-level, quick-check, multiple-choice, or code-check attempt behavior;
- LLM model choice, prompt templates, context assembly, token budgeting, or provider integration;
- whether evaluation is synchronous in the first implementation;
- queue technology, background worker topology, or retry scheduling;
- human review assignment, reviewer authority, escalation, or dispute workflow;
- analytics dashboards, reporting, institutional grading, classroom, cohort, or certification behavior;
- plagiarism detection, proctoring, identity verification during attempts, or exam integrity workflow;
- retention, deletion, export, or privacy policy beyond preserving required revision references;
- a standalone Assessment module;
- CLI commands.
