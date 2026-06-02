---
title: Agonara Module Responsibility Map
date: 2026-05-27
description: Architecture-level responsibility map for Agonara module boundaries.
model: gpt-5.5-thinking
version: 0.4.3
---

# Agonara Module Responsibility Map

## Purpose

This document defines responsibility boundaries between major Agonara modules.

It is a Pre-ADR responsibility map. The boundaries below are exploratory and may change before a formal ADR accepts module ownership.

It is not a workflow map, dependency map, data model, storage schema, deployment decision, or implementation plan.

## Context

The Product Intent separates accepted program content from a student's personal learning state. It also introduces materially different workflows: curator-owned program construction, student-owned progression through the program, and participation lifecycle for identities that relate to a program.

The key architectural tension is how to keep accepted corpus, curator drafts, student attempts, program membership, and identity/role state separate enough that each can evolve independently without turning every concern into a shared product-state module.

Known constraints:

- Accepted program corpus and personal student state must remain separate.
- Program membership must remain separate from identity lifecycle, curator content decisions, and student learning state.
- LLM output is draft material until a responsible module applies its acceptance rules.
- Identity and role management must govern who may act without owning the domain state of curator or student workflows.
- Storage design is deferred until module behavior and state ownership are clearer.

## Options considered

### Option A — Five modules: Corpus Storage, Program Membership, Curator Workspace, Student Workspace, Identity & Role Management

- **Description**: separate accepted corpus, program participation lifecycle, curator drafts/decisions, student state, and identity/role authority into five modules.
- **Tradeoffs**: makes ownership boundaries explicit and keeps membership state from being hidden inside either student learning state or curator content workflow. Adds another boundary early, which may create coordination overhead before implementation proves the split.
- **Product intent fit**: strong fit for INT-01 through INT-07 and membership stories because curator work, student progress, program participation, and identity authority remain distinct.
- **Risks**: Corpus Storage and Curator Workspace may overlap if acceptance workflows are too small to justify separate ownership.

### Option B — Four modules with membership embedded in workspaces

- **Description**: keep Corpus Storage, Curator Workspace, Student Workspace, and Identity & Role Management, while placing membership behavior inside Student Workspace and Curator Workspace.
- **Tradeoffs**: fewer top-level modules. Higher risk that student membership, curator participation, invitations, and exceptional recovery split across workspaces and drift into duplicated policy.
- **Product intent fit**: weaker fit because participation is neither student learning state nor curator content work.
- **Risks**: future extraction may be expensive after membership policy and state are already split across workspaces.

### Option C — Monolith-first with internal ownership conventions

- **Description**: keep all learning-domain behavior in one application module and rely on naming, folders, and tests to preserve ownership until stronger boundaries are needed.
- **Tradeoffs**: lowest startup overhead. Boundaries are easiest to violate because they are social conventions rather than module contracts.
- **Product intent fit**: acceptable only if the first implementation is extremely small and tests enforce the accepted corpus/student-state boundary.
- **Risks**: LLM suggestion state, membership state, curator decisions, and student progress can drift into one shared model without a clear owner.

## Emerging direction

Option A, the five-module split, is the current best candidate.

It most directly preserves the Product Intent boundary between shared program corpus and personal student state, while giving Program Membership a clear place to own participation lifecycle and giving Identity & Role Management a clear place to own identity and operational authority primitives. Program Membership ownership is accepted by [ADR-004](adr/adr-004-program-membership-owns-program-participation.md), first membership state/admission policy is accepted by [ADR-005](adr/adr-005-program-membership-state-and-first-admission-policy.md), Program Membership Manager is accepted as a narrative policy actor by [ADR-006](adr/adr-006-program-membership-policy-actor.md), the effective participation authorization contract is accepted by [ADR-007](adr/adr-007-effective-participation-authorization-contract.md), Program shell ownership plus initial curator participation are accepted by [ADR-009](adr/adr-009-program-shell-and-initial-curator-participation.md), the Corpus Storage / Curator Workspace acceptance boundary is accepted by [ADR-010](adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md), accepted checks / Student assessment boundaries are accepted by [ADR-011](adr/adr-011-accepted-checks-and-student-assessment-boundary.md), the Student Workspace open-answer attempt lifecycle is accepted by [ADR-012](adr/adr-012-student-workspace-open-answer-attempt-lifecycle.md), and open-answer evaluation governance is accepted by [ADR-013](adr/adr-013-student-workspace-open-answer-evaluation-governance.md). The remaining map is provisional where future specs have not yet chosen concrete schemas, APIs, or implementation slices.

## Provisional boundaries

The following responsibility map includes accepted boundaries from ADRs and remaining provisional boundaries. It is intended to make ownership questions explicit before storage, schema, or implementation planning.

| Module | Responsibility | Owns | Does Not Own | Key Boundary |
|---|---|---|---|---|
| Corpus Storage | Stores accepted program corpus and source materials used by programs. | Programs, topics, concepts, definitions, principles, accepted assessment items, assessment criteria, material references, source metadata, material storage references/copies. | Curator drafts, student attempts, student progress, membership state, LLM suggestions before acceptance. | Only accepted content belongs here. Candidate material enters Corpus Storage only after curator acceptance. |
| Program Membership | Manages participation of identities in programs. | Program membership lifecycle, join/leave/rejoin behavior, invitation lifecycle, membership status, membership policy, participant visibility rules, effective participation decisions, exceptional membership recovery hooks. | Identity lifecycle, credential bindings, accepted program corpus, curator content decisions, student answers, assessment feedback, mastery/progress interpretation. | Membership is product participation in a program; other modules ask for effective participation instead of reading policy internals. |
| Curator Workspace | Supports curator work on researching, assembling, refining, and accepting program content. | Research sources, candidate topics, candidate concepts, candidate materials, candidate checks, draft criteria, LLM-assisted suggestions, curator decisions. | Student learning history, student progress, learner assessment attempts, identity lifecycle, membership policy, membership state. | Curator work may prepare corpus changes, but does not become accepted corpus until accepted. Curator participation is established through Program Membership. |
| Student Workspace | Supports personal learning state inside joined programs. | Current learning position, learning sessions, answers, attempts, assessment feedback, evidence, mastery state, weak areas, review needs, personal history. | Accepted program corpus, curator drafts, membership lifecycle, membership policy, membership state, material storage ownership. | Student activity uses accepted corpus content after membership allows participation, but must not mutate accepted corpus or own membership lifecycle. |
| Identity & Role Management | Defines and manages identities, credentials, operational roles, and access primitives. | Internal identities, credential bindings, Admin role, role vocabulary, role invariants, role-management operations, access recovery. | Program membership lifecycle, program content, curator acceptance decisions, learner state, assessment logic. | Defines the internal subject and operational authority; does not own program participation lifecycle or workspace domain state. |

## Product intent traceability

| Module | Product intent served |
|---|---|
| Corpus Storage | INT-01, INT-02, INT-03, INT-04, INT-05, INT-06 by preserving accepted program structure, materials, checks, and criteria. |
| Program Membership | STU-18 through STU-23, CUR-14 through CUR-18, and ADM-12 through ADM-15 by governing how identities become, remain, rejoin, or stop being participants in programs. |
| Curator Workspace | INT-01 by supporting source collection, draft review, gap discovery, and acceptance into corpus. |
| Student Workspace | INT-02 through INT-07 by preserving learning sessions, attempts, feedback, weak areas, and progress evidence. |
| Identity & Role Management | INT-01 through INT-07 by providing identity and access primitives; ADM-01 through ADM-11 by owning identity, credential, Admin, audit, and recovery operations. |

## Product role and membership rules

Agonara separates identity, product roles, operational roles, and credentials.

An internal Identity is the subject of ownership and action in Agonara.

Product roles are program-scoped. ADR-004 accepts Program Membership as the owner for the lifecycle and policy of an Identity's participation in a Program under these product roles, ADR-005 accepts the first status and admission policy, and ADR-007 accepts the effective participation decision contract:

- `Student` — participates in a program and owns learner state within that program.
- `Program Curator` — curates a program and owns curator decisions within that program.

`Admin` is an operational role.

`Program Membership Manager` is a narrative policy actor for the Program Membership module. It is not a product role, operational role, grantable role, or authorization subject.

Admin is instance-scoped and manages identities, credential bindings, settings, and recovery-level operations.

Admin is not a learning role and does not replace Program Curator ownership of accepted program content.

Credentials and external accounts are bindings to internal Identity. They are not the source of Agonara ownership.

## Embedded Behaviors

Some behaviors are important but should not be modeled as top-level modules in this map.

| Behavior | Lives In | Reason |
|---|---|---|
| Assessment execution | Student Workspace | It evaluates student attempts against accepted check and criterion revisions as part of the learning loop. |
| Progress Interpretation | Student Workspace | It turns assessment evidence and learning activity into student-facing learning state. |
| LLM-assisted curation | Curator Workspace | It proposes structure, concepts, materials, checks, criteria, and coverage gaps for curator review. |
| LLM-assisted learning | Student Workspace | It may support open-answer evaluation, feedback, explanation, and study assistance. |

LLM output is never an independent owner of product state.

LLM output does not become accepted corpus content or final student progress state without the owning module applying its rules.

## Candidate ownership rules

| Area | Owner |
|---|---|
| Accepted Program Corpus | Corpus Storage |
| Accepted Checks and Assessment Criteria | Corpus Storage |
| Source Materials Used by Programs | Corpus Storage |
| Research Material and Candidate Content | Curator Workspace |
| Draft Checks and Proposed Criteria | Curator Workspace |
| Curator Decisions | Identity acting as Program Curator within a Program |
| Learner State | Identity acting as Student within a Program |
| Program Membership Lifecycle | Program Membership |
| Program Invitations | Program Membership |
| Participant Visibility | Program Membership |
| Effective Participation Decisions | Program Membership |
| Assessment Attempts and Feedback | Student Workspace |
| Mastery / Weakness / Review State | Student Workspace |
| Credentials / External Accounts | Identity & Role Management |
| Admin Authority | Identity & Role Management |

## Cross-cutting Responsibilities

Cross-cutting responsibilities are not modules in this map.

They cut across modules and must be designed without owning the product state of those modules.

These responsibilities are also provisional. Each may require its own Pre-ADR or ADR once the first implementable slice makes the operational constraints concrete.

The v0.0.1 minimum operational contract is specified in [Operational Cross-Cutting First Slice](specs/operational-cross-cutting-first-slice.md).

| Concern | Responsibility | Covers | Does Not Own |
|---|---|---|---|
| Logging | Records operational and domain-relevant events for diagnosis and audit. | Identity changes, membership changes, curator decisions, assessment attempts, LLM operations, backup/restore events. | Product analytics, progress interpretation, user-facing learning state. |
| Observability | Exposes health and execution state of the Agonara instance and long-running operations. | Service health, failed jobs, LLM calls, ingestion, assessment evaluation, storage access, backup status. | Domain ownership, user permissions, program content. |
| Backup / Restore | Protects recoverability of Agonara data and configuration. | Corpus Storage, Program Membership, Curator Workspace, Student Workspace, Identity & Role Management, material storage, operational configuration. | Content curation, assessment logic, product analytics interpretation. |
| Product Analytics | Captures product-usage and learning-behavior signals for improving Agonara. | Program usage, learning drop-offs, assessment friction, material usage, curator workflow usage. | Audit logging, operational health, authorization, formal progress state. |

## Open questions

- Which accepted check type should follow the open-answer first slice: quick checks, topic-level checks, or period-level checks?
- Which accepted revision retention and cleanup policy is needed after students already have attempts and progress evidence?
- Which cross-cutting concerns require their own ADR beyond the v0.0.1 operational contract: logging, backup/restore, observability, or analytics?
- Which evaluator implementation slice should follow open-answer attempt APIs: internal asynchronous evaluation status, LLM-assisted evaluation evidence, or human-review evaluator workflow?
