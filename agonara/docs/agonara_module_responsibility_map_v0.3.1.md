---
title: Agonara Module Responsibility Map
date: 2026-05-27
description: Architecture-level responsibility map for Agonara module boundaries.
model: gpt-5.5-thinking
version: 0.3.1
---

# Agonara Module Responsibility Map

## Purpose

This document defines responsibility boundaries between major Agonara modules.

It is a Pre-ADR responsibility map. The boundaries below are exploratory and may change before a formal ADR accepts module ownership.

It is not a workflow map, dependency map, data model, storage schema, deployment decision, or implementation plan.

## Context

The Product Intent separates accepted program content from a student's personal learning state. It also introduces two materially different workflows: curator-owned program construction and student-owned progression through the program.

The key architectural tension is how to keep accepted corpus, curator drafts, student attempts, and identity/role state separate enough that each can evolve independently without turning every concern into a shared product-state module.

Known constraints:

- Accepted program corpus and personal student state must remain separate.
- LLM output is draft material until a responsible module applies its acceptance rules.
- Identity and role management must govern who may act without owning the domain state of curator or student workflows.
- Storage design is deferred until module behavior and state ownership are clearer.

## Options considered

### Option A — Four modules: Corpus Storage, Curator Workspace, Student Workspace, Identity & Role Management

- **Description**: separate accepted corpus, curator drafts/decisions, student state, and identity/role authority into four modules.
- **Tradeoffs**: makes ownership boundaries explicit and keeps student state from mutating accepted corpus. Adds more module boundaries early, which may create coordination overhead before implementation proves the split.
- **Product intent fit**: strong fit for INT-01 through INT-07 because curator work, student progress, and identity authority remain distinct.
- **Risks**: Corpus Storage and Curator Workspace may overlap if acceptance workflows are too small to justify separate ownership.

### Option B — Two modules: Program Workspace and Identity & Role Management

- **Description**: combine corpus, curator drafts, and student state into one Program Workspace while keeping identity and roles separate.
- **Tradeoffs**: simpler initial implementation and fewer interfaces. Higher risk that accepted corpus, draft suggestions, and student state become coupled in data model and workflow language.
- **Product intent fit**: weaker fit for the corpus/student-state separation that Product Intent treats as central.
- **Risks**: future extraction may be expensive after program and student state are already entangled.

### Option C — Monolith-first with internal ownership conventions

- **Description**: keep all learning-domain behavior in one application module and rely on naming, folders, and tests to preserve ownership until stronger boundaries are needed.
- **Tradeoffs**: lowest startup overhead. Boundaries are easiest to violate because they are social conventions rather than module contracts.
- **Product intent fit**: acceptable only if the first implementation is extremely small and tests enforce the accepted corpus/student-state boundary.
- **Risks**: LLM suggestion state, curator decisions, and student progress can drift into one shared model without a clear owner.

## Emerging direction

Option A, the four-module split, is the current best candidate.

It most directly preserves the Product Intent boundary between shared program corpus and personal student state while giving Identity & Role Management a clear place to enforce who may act. This is provisional: the Corpus Storage / Curator Workspace boundary and the assessment ownership boundary need further pressure before ADR acceptance.

## Provisional boundaries

The following responsibility map is provisional. It is intended to make ownership questions explicit before storage, schema, or implementation planning.

| Module | Responsibility | Owns | Does Not Own | Key Boundary |
|---|---|---|---|---|
| Corpus Storage | Stores accepted program corpus and source materials used by programs. | Programs, topics, concepts, definitions, principles, accepted assessment items, assessment criteria, material references, source metadata, material storage references/copies. | Curator drafts, student attempts, student progress, role assignments, LLM suggestions before acceptance. | Only accepted content belongs here. Candidate material enters Corpus Storage only after curator acceptance. |
| Curator Workspace | Supports curator work on researching, assembling, refining, and accepting program content. | Research sources, candidate topics, candidate concepts, candidate materials, candidate checks, draft criteria, LLM-assisted suggestions, curator decisions. | Student learning history, student progress, learner assessment attempts, identity lifecycle, role assignments. | Curator work may prepare corpus changes, but does not become accepted corpus until accepted. |
| Student Workspace | Supports student participation in programs and personal learning state. | Enrolled programs, current learning position, learning sessions, answers, attempts, assessment feedback, evidence, mastery state, weak areas, review needs, personal history. | Accepted program corpus, curator drafts, role assignments, material storage ownership. | Student activity uses accepted corpus content but must not mutate it. |
| Identity & Role Management | Defines and manages identities, credentials, roles, and access boundaries. | Internal identities, credential bindings, product role assignments, admin role, role-management operations, access recovery. | Program content, curator acceptance decisions, learner state, assessment logic. | Defines who may act and under which role; does not own the workspaces’ domain state. |

## Product intent traceability

| Module | Product intent served |
|---|---|
| Corpus Storage | INT-01, INT-02, INT-03, INT-04, INT-05, INT-06 by preserving accepted program structure, materials, checks, and criteria. |
| Curator Workspace | INT-01 by supporting source collection, draft review, gap discovery, and acceptance into corpus. |
| Student Workspace | INT-02 through INT-07 by preserving learning sessions, attempts, feedback, weak areas, and progress evidence. |
| Identity & Role Management | INT-01 through INT-07 by constraining who may curate, administer, or act as a student in a program; ADM-01 through ADM-11 by owning identity, credential, role, admin, audit, and recovery operations. |

## Candidate product role rules

Agonara separates identity, product roles, operational roles, and credentials.

An internal Identity is the subject of ownership and action in Agonara.

Product roles are program-scoped:

- `Student` — participates in a program and owns learner state within that program.
- `Program Curator` — curates a program and owns curator decisions within that program.

`Admin` is an operational role.

Admin is instance-scoped and manages identities, role assignments, credential bindings, settings, and recovery-level operations.

Admin is not a learning role and does not replace Program Curator ownership of accepted program content.

Credentials and external accounts are bindings to internal Identity. They are not the source of Agonara ownership.

## Embedded Behaviors

Some behaviors are important but should not be modeled as top-level modules in this map.

| Behavior | Lives In | Reason |
|---|---|---|
| Assessment | Student Workspace | It evaluates student answers and attempts as part of the learning loop. |
| Progress Interpretation | Student Workspace | It turns assessment evidence and learning activity into student-facing learning state. |
| LLM-assisted curation | Curator Workspace | It proposes structure, concepts, materials, checks, criteria, and coverage gaps for curator review. |
| LLM-assisted learning | Student Workspace | It may support open-answer evaluation, feedback, explanation, and study assistance. |

LLM output is never an independent owner of product state.

LLM output does not become accepted corpus content or final student progress state without the owning module applying its rules.

## Candidate ownership rules

| Area | Owner |
|---|---|
| Accepted Program Corpus | Corpus Storage |
| Source Materials Used by Programs | Corpus Storage |
| Research Material and Candidate Content | Curator Workspace |
| Curator Decisions | Identity acting as Program Curator within a Program |
| Learner State | Identity acting as Student within a Program |
| Assessment Attempts and Feedback | Student Workspace |
| Mastery / Weakness / Review State | Student Workspace |
| Credentials / External Accounts | Identity & Role Management |
| Role Assignments | Identity & Role Management |

## Cross-cutting Responsibilities

Cross-cutting responsibilities are not modules in this map.

They cut across modules and must be designed without owning the product state of those modules.

These responsibilities are also provisional. Each may require its own Pre-ADR or ADR once the first implementable slice makes the operational constraints concrete.

| Concern | Responsibility | Covers | Does Not Own |
|---|---|---|---|
| Logging | Records operational and domain-relevant events for diagnosis and audit. | Identity changes, role assignments, curator decisions, assessment attempts, LLM operations, backup/restore events. | Product analytics, progress interpretation, user-facing learning state. |
| Observability | Exposes health and execution state of the Agonara instance and long-running operations. | Service health, failed jobs, LLM calls, ingestion, assessment evaluation, storage access, backup status. | Domain ownership, user permissions, program content. |
| Backup / Restore | Protects recoverability of Agonara data and configuration. | Corpus Storage, Curator Workspace, Student Workspace, Identity & Role Management, role assignments, material storage, operational configuration. | Content curation, assessment logic, product analytics interpretation. |
| Product Analytics | Captures product-usage and learning-behavior signals for improving Agonara. | Program usage, learning drop-offs, assessment friction, material usage, curator workflow usage. | Audit logging, operational health, authorization, formal progress state. |

## Open questions

- Is Corpus Storage distinct from Curator Workspace in the first slice, or should accepted and candidate corpus behavior start behind one module boundary?
- Should Assessment remain embedded in Student Workspace, or does open-answer evaluation need an explicit assessment module later?
- Which module owns versioning when accepted program corpus changes after students already have attempts and progress evidence?
- Which cross-cutting concerns require their own ADR before implementation: logging, backup/restore, observability, or analytics?
- How should LLM-assisted learning be bounded so that feedback helps the student without becoming the owner of final progress state?
