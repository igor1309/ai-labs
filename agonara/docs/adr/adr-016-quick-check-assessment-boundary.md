---
date: 2026-06-02
model: gpt-5
description: "Decision for Agonara deterministic single-select quick-check assessment boundaries."
status: accepted
---

# ADR-016 - Quick-Check Assessment Boundary

## Executive Summary

Agonara chooses deterministic single-select quick checks as the next assessment slice after open-answer evaluation.

Corpus Storage owns accepted quick-check revisions, answer options, and answer keys as versioned Program corpus.

Student Workspace owns student quick-check attempts, selected answers, deterministic results, and student-specific evidence.

Student-facing delivery projections must expose answerable options without exposing answer keys.

Quick-check results provide evidence only. They must not create mastery, weak-area, progress, review-scheduling, next-step, or topic-readiness state as hidden side effects.

This ADR decides the next check priority and ownership boundary. It does not decide UI, HTTP payloads, scoring aggregation, or readiness interpretation.

## Context

[ADR-010](adr-010-corpus-storage-and-curator-acceptance-boundary.md) assigns accepted Program corpus to Corpus Storage and candidate material to Curator Workspace before explicit curator acceptance.

[ADR-011](adr-011-accepted-checks-and-student-assessment-boundary.md) assigns accepted checks and criteria to Corpus Storage while keeping attempts, answers, results, feedback, evidence, mastery state, weak-area state, review state, and learning history in Student Workspace.

[ADR-012](adr-012-student-workspace-open-answer-attempt-lifecycle.md) through [ADR-015](adr-015-open-answer-evaluator-worker-provider-boundary.md) establish the open-answer lifecycle, evaluation governance, orchestration, and worker boundaries. Open-answer evaluation now gives Agonara one governed source of personal assessment evidence.

The [Product Intent](../intent_learning_program_app.md) requires a student to answer checks during study and see whether the result confirms or challenges current understanding. The [Student User Stories](../student_user_stories.md) require quick-check results to become part of the student's personal evidence.

The remaining architectural tension is which accepted check type should follow open answers. Topic-level and period-level checks require readiness interpretation, aggregation, and progression policy. Quick checks can prove a second assessment shape with deterministic feedback while preserving the accepted-corpus / student-state boundary.

This ADR uses `quick check` for a deterministic accepted assessment item answered by selecting exactly one option. It uses `answer key` for the accepted option identifier used to evaluate the selected answer. It uses `delivery projection` for the student-safe view of an accepted quick check that contains answerable content but omits the answer key. It uses `quick-check evidence` for the Student Workspace result linked to one attempt and one accepted quick-check revision.

The rejected alternatives are implementing topic-level or period-level checks first, embedding answer keys in student-facing delivery projections, storing selected answers or results in Corpus Storage, mutating an attempt after submission, and deriving mastery or progression during quick-check recording. Those alternatives either add interpretation policy before a second evidence source exists or violate the established ownership boundary.

Industry reference points support the narrow slice. Retryable mutations benefit from [idempotency keys](https://docs.stripe.com/api/idempotent_requests). Assessment content and answer keys require least-privilege delivery: [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) recommends server-side enforcement and least privilege. These references guide Agonara's constraints without selecting transport payloads or storage schema.

## Decision

Agonara MUST choose deterministic single-select quick checks as the next accepted assessment slice after open-answer evaluation.

Corpus Storage MUST own accepted quick-check entities and stable accepted quick-check revisions.

An accepted quick-check revision MUST be scoped to one stable `Program` and MUST define one prompt, two or more answer options with stable option identifiers, and exactly one answer-key option identifier.

Accepted quick-check revisions MUST cross from Curator Workspace into Corpus Storage through explicit acceptance by an effective `Program Curator`.

Corpus Storage MUST expose a student-facing delivery projection that includes the accepted quick-check revision identifier, prompt, and answerable options while excluding the answer key.

Student Workspace MUST own each quick-check attempt, selected option identifier, deterministic result, and student-specific evidence.

At submission time, Student Workspace MUST resolve one accepted quick-check revision, require effective `Student` participation for its Program, validate that the selected option belongs to that revision, and record an immutable attempt.

Student Workspace MUST evaluate the selected option against the answer key through a server-side boundary. Student-facing reads, faults, logs, and transport metadata MUST NOT expose answer keys or option correctness metadata.

The deterministic result MUST record whether the selected answer matched the answer key. Student-facing result reads MAY expose that matched-or-not-matched outcome and the student's selected option identifier while withholding the answer key and correctness metadata for every option.

Protected operational backup and restore MUST preserve accepted quick-check revisions, options, and answer keys inside the protected backup contract. They MUST NOT turn answer keys or option correctness metadata into student-facing payloads.

Quick-check submission MUST be idempotent for client retries. Equivalent reuse of a client-provided idempotency key within the acting student, Program, and accepted quick-check revision boundary MUST return the same attempt result. Materially different reuse MUST be rejected without creating or changing an attempt.

Quick-check attempts and results MUST reference the accepted quick-check revision used at submission time. Later accepted quick-check revisions MUST NOT rewrite historical attempts or results.

Quick-check results MUST remain evidence. They MUST NOT directly create or update mastery, weak-area, progress, review-scheduling, next-step, topic-readiness, period-readiness, grading, analytics, or reporting state.

Admin authority MUST NOT by itself submit quick-check attempts, reveal answer keys, rewrite selected answers, or rewrite results through ordinary product flows.

Program Curator authority MUST NOT by itself submit attempts for a student or rewrite student quick-check results through ordinary curator flows.

## Rules / Invariants

- Corpus Storage owns accepted quick-check entities, revisions, answer options, and answer keys.
- Curator Workspace owns draft quick checks, proposed options, proposed answer keys, review notes, and LLM-generated quick-check suggestions before acceptance.
- Student Workspace owns quick-check attempts, selected answers, deterministic results, and quick-check evidence.
- Program Membership owns effective `Student` and effective `Program Curator` participation checks used by this boundary.
- Identity & Role Management owns the acting internal `Identity` and Admin authority; it MUST NOT own quick-check content or student results.
- An accepted quick-check revision MUST belong to one stable `Program`.
- An accepted quick-check revision MUST have at least two answer options.
- Each accepted quick-check answer option MUST have a stable identifier within its revision.
- Student-facing option identifiers MUST be opaque and MUST NOT encode correctness, answer-key status, or curator-only metadata.
- An accepted quick-check revision MUST have exactly one answer-key option identifier.
- The answer-key option identifier MUST reference an option in the accepted quick-check revision.
- Accepted quick-check revisions MUST preserve curator attribution and provenance through the existing acceptance boundary.
- A delivery projection MUST include the accepted quick-check revision identifier needed for submission.
- A delivery projection MUST NOT include the answer key, a correctness flag, or metadata that reveals which option is correct.
- Quick-check submission MUST require the owning student's effective participation for the Program.
- Quick-check submission MUST reject unknown accepted quick-check revisions, draft candidate identifiers, rejected candidate identifiers, and mutable entity identifiers used without resolution to a concrete revision.
- Quick-check submission MUST reject selected option identifiers that do not belong to the accepted revision.
- A quick-check attempt MUST reference the accepted quick-check revision used for evaluation.
- A quick-check attempt MUST preserve the selected option identifier submitted by the student.
- A quick-check attempt and result MUST be immutable after accepted submission.
- A corrective answer MUST create a new attempt rather than mutate the prior selected answer or result.
- Retryable submission APIs MUST require a client-provided idempotency key.
- Equivalent idempotency-key reuse MUST return the original attempt result without creating a duplicate.
- Materially different idempotency-key reuse MUST reject without creating or changing an attempt.
- Idempotency keys MUST NOT be treated as authentication or authorization tokens.
- Evaluation MUST compare the selected option identifier to the accepted revision answer key on the server side.
- Student-facing reads, faults, logs, and transport metadata MUST NOT expose answer keys or option correctness metadata.
- A deterministic result MUST preserve whether the selected answer matched the answer key.
- Student-facing result reads MAY expose the matched-or-not-matched outcome and selected option identifier while withholding the answer key and correctness metadata for every option.
- Protected operational backup and restore MUST preserve accepted quick-check revisions, options, and answer keys without exposing them through student-facing projections.
- Restore MUST reject accepted quick-check revisions whose answer key is missing, duplicated, or references an option outside the revision.
- Backup and restore MUST preserve accepted quick-check revision references and historical quick-check attempts and results.
- Restore MUST reject quick-check attempts that reference missing Programs, missing Identities, missing accepted quick-check revisions, or selected option identifiers outside the referenced revision.
- Updating or rejecting draft quick-check candidates MUST NOT rewrite accepted quick-check revisions or historical Student Workspace evidence.
- Accepting a later quick-check revision MUST NOT rewrite prior attempts or results.
- Quick-check recording MUST NOT mutate accepted corpus, curator candidates, Program Membership state, Identity state, sessions, credentials, Admin authority, or CSRF state.
- Quick-check recording MUST NOT create mastery, weak-area, progress, review-scheduling, next-step, topic-readiness, period-readiness, grading, analytics, or reporting state.
- Specs and implementation plans for quick checks MUST include tests or review checks for answer-key exclusion, opaque student-facing option identifiers, bounded matched-or-not-matched result reads, accepted-revision references, selected-option validation, idempotent submission, immutable history, protected backup preservation, backup/restore graph validation, ownership isolation, and absence of hidden learner-state interpretation.

## Consequences

Agonara gains a small deterministic assessment slice that complements open-answer feedback without introducing another evaluator worker path.

Students can receive immediate quick-check evidence while Corpus Storage remains the owner of accepted questions and answer keys.

Answer-key exclusion requires separate internal accepted-revision access and student-facing delivery projection behavior. This adds projection discipline but prevents answer leakage through ordinary student reads.

Append-only attempts and idempotent submission add storage and API contract work, but they preserve history and prevent duplicate evidence under client retry.

Quick-check evidence can later feed mastery, weak-area, review scheduling, next-step, topic-readiness, or period-readiness interpretation. Those policies require separate ADRs or specs so they do not emerge as hidden side effects.

Topic-level and period-level checks remain viable future slices. Their progression semantics should build on explicit evidence interpretation rather than duplicating quick-check storage rules.

A later ADR MAY introduce multiple-select, free-form deterministic, spaced-repetition, or adaptive quick checks if it preserves answer-key secrecy, stable accepted revisions, append-only student evidence, and explicit interpretation boundaries.

## Non-Goals

This ADR does not decide:

- concrete database tables, columns, migrations, indexes, or storage layout;
- HTTP route names, request payloads, response payloads, status codes, or pagination;
- Student UI, Admin UI, Curator UI, Program UI, or generated frontend artifacts;
- multiple-select, ordering, matching, code-check, free-form deterministic, adaptive, or spaced-repetition check behavior;
- option randomization, localization, accessibility presentation, or rich-media options;
- topic-level checks, period-level checks, readiness thresholds, progression gates, or certification;
- mastery calculation, weak-area calculation, progress interpretation, review scheduling, or next-step recommendation;
- scoring aggregation, weighting, partial credit, negative marking, grade scales, or institutional grading;
- analytics, reporting, classroom, cohort, or proctoring workflows;
- plagiarism detection, exam integrity, or identity verification during attempts;
- material navigation or learning-session continuation;
- LLM-generated quick-check creation beyond keeping suggestions outside accepted corpus until curator acceptance;
- external provider calls, evaluator workers, queues, or human review for quick-check evaluation;
- a standalone Assessment module;
- CLI commands.
