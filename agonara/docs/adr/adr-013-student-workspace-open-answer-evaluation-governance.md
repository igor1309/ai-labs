---
date: 2026-06-02
model: gpt-5
description: "Decision for Agonara Student Workspace open-answer evaluation governance."
status: accepted
---

# ADR-013 - Student Workspace Open-Answer Evaluation Governance

## Executive Summary

Agonara treats open-answer evaluation as Student Workspace-governed assessment behavior.

Student Workspace remains the authority for final student-facing feedback and evaluation outcomes.

Deterministic, LLM-assisted, and human-reviewed execution paths may support evaluation, but they act as governed evaluator paths rather than product-state owners.

Every final evaluation outcome must be attributable, tied to the attempt's accepted check and criterion revisions, and separated from raw evaluator diagnostics.

Long-running evaluation must use an explicit asynchronous workflow instead of hiding background work inside a normal request/response path.

This ADR decides evaluator governance and authority boundaries. It does not select an LLM provider, prompt design, queue technology, UI, mastery rules, grading, or human-review workflow.

## Context

[ADR-010](adr-010-corpus-storage-and-curator-acceptance-boundary.md) establishes Corpus Storage ownership of accepted Program corpus.

[ADR-011](adr-011-accepted-checks-and-student-assessment-boundary.md) assigns student attempts, feedback, evidence, mastery state, weak-area state, review state, and learning history to Student Workspace.

[ADR-012](adr-012-student-workspace-open-answer-attempt-lifecycle.md) accepts the open-answer attempt lifecycle and leaves evaluator execution choices open. The implemented first slices now record open-answer attempts, internal evaluation outcomes, active evaluation failures, owner-only reads, HTTP submission, and HTTP detail/list reads without HTTP evaluation mutation routes.

The [Product Intent](../intent_learning_program_app.md) requires a student to submit an open answer and receive feedback tied to accepted criteria. The [Student User Stories](../student_user_stories.md) require feedback that identifies strengths, gaps, and confusion relative to accepted criteria.

The remaining architectural tension is evaluator authority. Open-answer evaluation may eventually involve deterministic rubric logic, LLM assistance, asynchronous work, and human review. If evaluator outputs become final feedback directly, Student Workspace loses control over learner state. If Admins or Program Curators can rewrite feedback through ordinary product flows, operational and curation authority leaks into personal student assessment. If raw prompts, raw model responses, or evaluator diagnostics are treated as student-facing feedback, private operational evidence can leak. If slow evaluation runs inside a synchronous route, clients cannot reliably reason about status, retry, failure, or recovery.

The rejected alternatives are letting LLM output become final feedback without Student Workspace acceptance, exposing product-role HTTP routes that directly mutate evaluations, making Admin or Program Curator authority sufficient to rewrite student feedback, and introducing a standalone Assessment module before evaluator governance is explicit. Those alternatives either violate ADR-011/ADR-012 ownership or decide operational topology before the authority boundary is stable.

Industry guidance supports this boundary. The [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) and [NIST Generative AI Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence) emphasize governed, measured, and accountable AI use. The [OWASP Top 10 for Large Language Model Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications) highlights prompt injection and sensitive information disclosure risks. The [Azure asynchronous request-reply pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/async-request-reply) is a common reference for making long-running work explicit to clients. These references guide risk handling; they do not mandate Agonara's concrete implementation.

## Decision

Agonara MUST govern open-answer evaluation outcomes through Student Workspace.

Student Workspace MUST remain the owner of final student-facing open-answer evaluation outcomes, feedback, and student-specific evidence.

An evaluator path MAY be deterministic, LLM-assisted, human-reviewed, or delegated to a later Assessment module, but the path MUST operate under Student Workspace evaluation rules until a later ADR changes ownership.

A final evaluation outcome MUST be recorded as Student Workspace state linked to the attempt, accepted open-answer check revision, and accepted criterion revision identifiers used for the attempt.

Evaluator outputs MUST be attributable to an evaluator path before they can become final student-facing feedback.

Human-reviewed final evaluation outcomes MUST preserve the reviewing internal `Identity` and reviewer capability that accepted the outcome.

Automated final evaluation outcomes MUST preserve the evaluator path and policy identity needed to audit which governed evaluator accepted the outcome.

LLM outputs, raw model responses, prompt transcripts, evaluator diagnostics, reviewer notes, and model metadata MAY be stored as internal evaluation evidence when a future spec allows it, but they MUST NOT become final feedback or progress evidence until Student Workspace records a final evaluation outcome under its rules.

Human review MAY be introduced later as an evaluator path, but reviewer authority MUST be scoped separately from Admin and Program Curator authority.

Admin authority remains operational. Admin authority MUST NOT by itself evaluate attempts, rewrite feedback, or convert evaluator evidence into final learner state through ordinary product flows.

Program Curator authority remains curation authority. Program Curator authority MUST NOT by itself evaluate attempts, rewrite feedback, or convert evaluator evidence into final learner state through ordinary curator flows.

Open-answer evaluation mutation remains an internal Student Workspace capability unless a later spec defines a bounded product-facing workflow for evaluator operation, human review, support recovery, or asynchronous status.

Long-running evaluation MUST use an explicit asynchronous workflow with observable status and failure state. Synchronous evaluation MAY be used only when completion fits the normal request/response budget and does not hide background work.

Evaluation outcomes MAY feed mastery, weak-area, progress, review scheduling, or next-step behavior later, but those downstream interpretations MUST be specified separately and MUST NOT appear as hidden side effects of evaluation recording.

## Rules / Invariants

- Student Workspace owns final open-answer evaluation outcomes.
- Student Workspace owns student-facing feedback.
- Student Workspace owns student-specific evaluation evidence.
- Accepted checks and accepted criteria remain Corpus Storage state.
- Final evaluation outcomes MUST reference the open-answer attempt being evaluated.
- Final evaluation outcomes MUST reference the accepted open-answer check revision used by the attempt.
- Final evaluation outcomes MUST reference the accepted criterion revision identifiers used by the attempt.
- Final evaluation outcomes MUST preserve attribution to the evaluator path that produced or accepted the outcome.
- Evaluator path attribution MUST be specific enough for audit and debugging without exposing raw diagnostics to students.
- Human-reviewed final evaluation outcomes MUST preserve the reviewing internal `Identity`.
- Human-reviewed final evaluation outcomes MUST preserve the reviewer capability or evaluator workflow under which the reviewer acted.
- Automated final evaluation outcomes MUST preserve the governed evaluator path and policy identity that accepted the outcome.
- Deterministic evaluator output MUST be recorded under Student Workspace evaluation rules before it becomes final feedback.
- LLM-assisted evaluator output MUST be recorded under Student Workspace evaluation rules before it becomes final feedback.
- Human-reviewed evaluator output MUST be recorded under Student Workspace evaluation rules before it becomes final feedback.
- Raw prompts, raw model responses, model metadata, evaluator diagnostics, and reviewer notes MUST be separated from student-facing feedback.
- Student-facing feedback MUST NOT expose raw prompts, raw model responses, hidden policy instructions, evaluator diagnostics, stack traces, SQL text, filesystem paths, database URLs, secrets, session identifiers, CSRF tokens, cookie headers, or authorization headers.
- LLM-assisted evaluation MUST treat student answers and accepted corpus content as untrusted prompt input for security purposes.
- LLM-assisted evaluation MUST constrain model output before it is stored as final feedback or used by downstream learner-state interpretation.
- LLM-assisted evaluation MUST have redaction rules before any raw model evidence is persisted or surfaced.
- Human review thresholds MUST be explicit before human review becomes part of ordinary evaluation flow.
- Reviewer authority, if introduced, MUST be scoped as an evaluator capability rather than inherited from Admin or Program Curator authority.
- Admin authority MUST NOT be sufficient to author ordinary final evaluation outcomes.
- Program Curator authority MUST NOT be sufficient to author ordinary final evaluation outcomes.
- Support or recovery operations MAY be introduced later only if they preserve Student Workspace ownership, auditability, and private attempt boundaries.
- Product-facing HTTP routes MUST NOT expose `markOpenAnswerAttemptEvaluating`, `recordOpenAnswerEvaluation`, or `recordOpenAnswerEvaluationFailure` as ordinary Student, Program Curator, or Admin routes.
- Long-running evaluation MUST expose status and failure as explicit Student Workspace state or through a future explicitly specified asynchronous workflow.
- Evaluation retry MUST preserve the submitted attempt and accepted revision references.
- Evaluation retry MUST NOT create a duplicate attempt for the same submitted answer.
- Evaluation failure MUST preserve the attempt and record a failure state that can be inspected or retried under Student Workspace rules.
- Evaluation recording MUST NOT mutate accepted checks, accepted criteria, accepted revisions, source records, curator candidates, Program Membership state, Identity state, sessions, or CSRF state.
- Evaluation recording MUST NOT create mastery, weak-area, progress, review-scheduling, next-step, grading, analytics, or reporting state unless a future spec explicitly introduces that downstream behavior.
- Specs and implementation plans that introduce evaluator paths MUST include tests or review checks for attribution, redaction, accepted revision references, failure preservation, async status when long-running work exists, and absence of Admin/Program Curator feedback-authoring shortcuts.

## Consequences

Student Workspace can evolve from the current internal evaluator commands toward deterministic, LLM-assisted, asynchronous, or human-reviewed evaluation without losing ownership of final learner state.

Evaluator path attribution adds contract and storage pressure, but it gives future audit, support, and debugging work a stable basis.

Human review now carries an explicit attribution requirement. That keeps reviewer work auditable without making Admin or Program Curator authority sufficient for ordinary feedback authoring.

LLM support remains possible while acknowledging prompt-injection and sensitive-disclosure risks early. Future specs must define redaction, evidence retention, and output-constraining rules before model evidence is persisted or surfaced.

Human review remains available as a future evaluator path, but ordinary Admin and Program Curator authority cannot quietly become feedback-authoring authority.

Explicit asynchronous evaluation avoids ambiguous client behavior when evaluation cannot finish quickly. It also makes failures and retries visible as Student Workspace state.

Downstream mastery, weak-area, progress, next-step, grading, and analytics behavior can consume evaluation outcomes later without being smuggled into the evaluator boundary.

A standalone Assessment module remains possible if evaluator orchestration becomes large enough to justify a new owner. A later ADR must preserve Corpus Storage ownership of accepted corpus and Student Workspace ownership of personal learner state, or explicitly amend those boundaries.

## Non-Goals

This ADR does not decide:

- concrete database tables, columns, migrations, indexes, or storage layout;
- HTTP route names, request payloads, response payloads, or status codes;
- queue technology, worker topology, scheduling, retry backoff, leases, or concurrency limits;
- synchronous evaluation as the first implementation strategy;
- LLM provider, model, embedding model, prompt template, context assembly, token budget, temperature, or model-routing policy;
- concrete prompt-injection mitigations beyond requiring future specs to handle untrusted prompt input and redaction;
- human review assignment, review queues, reviewer UI, dispute workflow, escalation workflow, or reviewer compensation workflow;
- Student UI, Admin UI, Curator UI, Program UI, or generated frontend artifacts;
- mastery calculation, weak-area calculation, progress interpretation, review scheduling, next-step recommendation, grading, analytics, reporting, certification, classroom, cohort, or institutional workflows;
- plagiarism detection, proctoring, identity verification during attempts, exam integrity, or academic misconduct workflow;
- retention, deletion, export, privacy, or legal compliance policy beyond separating student-facing feedback from internal evaluator evidence;
- a standalone Assessment module;
- CLI commands.
