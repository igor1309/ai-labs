---
date: 2026-05-28
model: gpt-5
description: "Decision for Agonara accepted checks, assessment criteria, and Student Workspace assessment boundaries."
status: accepted
---

# ADR-011 - Accepted Checks and Student Assessment Boundary

## Executive Summary

Agonara separates accepted checks and assessment criteria from student attempts and assessment outcomes.

Corpus Storage owns accepted checks, prompts, expected evidence, and assessment criteria as versioned Program corpus.

Student Workspace owns student attempts, submitted answers, evaluation results, feedback, progress evidence, mastery state, and weak-area state.

Assessment execution remains a Student Workspace responsibility for now because it evaluates a student's personal answer against accepted Program corpus.

This ADR decides ownership and reference boundaries only. It does not decide check schema, scoring algorithms, LLM evaluation prompts, UI, API routes, or whether a later Assessment module is needed.

## Context

[ADR-001](adr-001-internal-identity-as-agonara-ownership-subject.md) establishes internal `Identity` as the subject of ownership, action, attribution, and authorization context.

[ADR-002](adr-002-role-authority-scope-model.md) establishes `Student` and `Program Curator` as Program-scoped product roles and `Admin` as instance-scoped operational authority.

[ADR-004](adr-004-program-membership-owns-program-participation.md) through [ADR-007](adr-007-effective-participation-authorization-contract.md) establish Program Membership as the owner of participation lifecycle and effective participation checks.

[ADR-009](adr-009-program-shell-and-initial-curator-participation.md) establishes the accepted `Program` shell as the stable Program scope.

[ADR-010](adr-010-corpus-storage-and-curator-acceptance-boundary.md) establishes Corpus Storage ownership of accepted Program corpus and Student Workspace ownership of learner state. It explicitly leaves open whether assessment remains embedded in Student Workspace or becomes a separate module.

The [Product Intent](../intent_learning_program_app.md) separates shared Program corpus from a student's personal learning state. It says materials, concepts, checks, and criteria belong to the Program, while answers, attempts, results, gaps, and progress belong to the student.

The [Curator User Stories](../curator_user_stories.md) require curators to add checks and define assessment criteria as accepted Program corpus.

The [Student User Stories](../student_user_stories.md) require students to answer checks, submit open answers, receive feedback, inspect check results, and see progress evidence as personal learning state.

The architectural tension is that assessment depends on both shared Program content and personal student evidence. If accepted checks and criteria live in Student Workspace, each student can drift against a private copy of the Program. If attempts and feedback live in Corpus Storage, accepted Program corpus becomes polluted with personal state. If a standalone Assessment module is introduced before the first assessment behavior exists, the system gains a coordination boundary without proven need.

The rejected alternatives are storing checks and criteria in Student Workspace, storing attempts and feedback in Corpus Storage, and introducing a top-level Assessment module now. Storing checks and criteria in Student Workspace breaks shared Program consistency. Storing attempts and feedback in Corpus Storage violates the corpus/student-state separation. Introducing a new module now would decide operational and algorithmic ownership before the first assessment slice proves what must be isolated.

## Decision

Agonara MUST model accepted checks, prompts, expected evidence, rubrics, and assessment criteria as accepted Program corpus owned by Corpus Storage.

Accepted checks and criteria MUST cross from Curator Workspace into Corpus Storage through the same explicit curator acceptance boundary used for other accepted corpus.

Corpus Storage MUST preserve stable accepted revisions for accepted checks and criteria when changes can affect student attempts, feedback, progress evidence, or mastery interpretation.

Student Workspace MUST own student attempts, submitted answers, selected answers, evaluation results, feedback, evidence, mastery state, weak-area state, review state, and learning history.

Student Workspace MUST evaluate or orchestrate evaluation of a student's attempt against accepted check and criterion revisions. The evaluation may use deterministic logic, human review, or LLM assistance later, but the resulting student-specific outcome remains Student Workspace state.

Student Workspace MUST reference accepted check and criterion revisions instead of copying ownership of checks, prompts, rubrics, or criteria.

Corpus Storage MUST NOT own student attempts, submitted answers, feedback, evaluation outcomes, mastery state, weak-area state, review state, or personal learning history.

Curator Workspace MUST own draft checks, proposed criteria, LLM-generated checks, LLM-generated criteria, review notes, and gap analysis before acceptance.

Program Membership MUST authorize Student participation before Student Workspace records attempts or assessment outcomes for a Program.

Program Membership MUST authorize effective Program Curator participation before accepted checks or criteria can be accepted into Corpus Storage.

Identity & Role Management owns the acting internal `Identity` and Admin authority. It MUST NOT own checks, criteria, attempts, feedback, assessment outcomes, or progress interpretation.

Admin authority remains operational recovery authority. Admin authority MUST NOT by itself author accepted checks, assess student answers, or change mastery/progress state through ordinary product flows.

## Rules / Invariants

- Accepted checks and assessment criteria are accepted Program corpus.
- Accepted checks and assessment criteria MUST live in Corpus Storage.
- Draft checks, proposed criteria, LLM-generated checks, LLM-generated criteria, and review notes MUST live outside accepted corpus until accepted.
- Accepted checks and assessment criteria MUST be scoped to a stable `Program` shell.
- Accepted checks and assessment criteria MUST be accepted by an effective `Program Curator` for the Program.
- Accepted checks and assessment criteria MUST preserve attribution to the acting internal `Identity`.
- Accepted checks and assessment criteria MUST preserve provenance to source material, candidate material, or curator rationale when available.
- Accepted check and criterion changes MUST create stable accepted revisions when they can affect student attempts, feedback, progress evidence, or mastery interpretation.
- Student attempts MUST reference the accepted check revision used for the attempt.
- Student feedback and evaluation outcomes MUST reference the accepted check and criterion revisions used for evaluation.
- Student attempts, submitted answers, selected answers, evaluation results, feedback, evidence, mastery state, weak-area state, review state, and learning history MUST live in Student Workspace.
- Student Workspace MUST NOT mutate accepted checks or accepted criteria.
- Corpus Storage MUST NOT record personal student attempts, answers, feedback, mastery state, weak-area state, or progress interpretation as accepted corpus.
- Updating an accepted check or criterion MUST NOT rewrite prior student attempts or feedback that referenced an earlier accepted revision.
- Deleting or rejecting a draft check or draft criterion MUST NOT remove accepted check revisions, accepted criterion revisions, or student references to those revisions.
- LLM-assisted evaluation MAY support Student Workspace assessment behavior later, but LLM output MUST NOT become final feedback, mastery state, or progress evidence until Student Workspace applies its assessment rules.
- LLM-generated checks or criteria MAY support Curator Workspace curation later, but they MUST remain draft candidate material until accepted by an effective `Program Curator`.
- A later Assessment module MAY be introduced by a new ADR only if it preserves Corpus Storage ownership of accepted checks and criteria and Student Workspace ownership of student-specific attempts, outcomes, feedback, and progress evidence.
- Later specs MAY define check types, criterion schema, scoring, evaluation workflows, LLM prompts, UI, API routes, storage tables, migration strategy, and review operations only if they preserve this ownership boundary.

## Consequences

The assessment boundary is now stable enough to specify checks and criteria without mixing personal student evidence into accepted Program corpus.

Student Workspace remains the first owner of assessment execution because assessment starts from a student's attempt and produces student-specific feedback and progress evidence.

Corpus Storage must treat accepted checks and criteria like other accepted corpus: stable Program scope, explicit curator acceptance, provenance, and stable revisions when student evidence may depend on them.

Student attempts and feedback must store references to accepted check and criterion revisions. This adds reference discipline but protects historical evidence when a curator later improves a check, rubric, or criterion.

LLM assistance stays bounded. It can propose checks or evaluate answers later, but it does not become an owner of accepted corpus or final student progress state.

A future standalone Assessment module remains possible, but it must be justified by concrete coordination needs such as reusable evaluation engines, queueing, human review, or model orchestration. That future module would orchestrate behavior; it would not take ownership of accepted checks or personal student state without a new ADR.

Future specs should choose the smallest check shape that proves the boundary. A narrow first implementation can start with accepted quick checks or open-answer prompts and one criterion reference, as long as attempts and feedback reference accepted revisions instead of copying or mutating corpus records.

## Non-Goals

This ADR does not decide:

- concrete database tables, columns, migrations, or storage layout;
- accepted check schema;
- assessment criteria schema;
- quick-check, open-answer, topic-level, or period-level check priority;
- scoring algorithms;
- mastery or weak-area calculation rules;
- LLM prompt design, model choice, or evaluation workflow;
- human review workflow for assessment;
- material storage or source ingestion;
- Curator Workspace UI;
- Student Workspace UI;
- HTTP API route names;
- CLI commands;
- implementation plan phases;
- reporting, analytics, classroom, cohort, or institutional grading behavior;
- whether a later standalone Assessment module is needed.
