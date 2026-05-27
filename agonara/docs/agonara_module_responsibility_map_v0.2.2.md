---
title: Agonara Module Responsibility Map
description: Architecture-level responsibility map for Agonara module boundaries.
model: gpt-5.5-thinking
version: 0.2.2
---

# Agonara Module Responsibility Map

## Purpose

This document defines responsibility boundaries between major Agonara modules.

It is an architecture-level responsibility map.

It is not a workflow map, dependency map, data model, storage schema, deployment decision, or implementation plan.

## Responsibility Map

| Module | Responsibility | Owns | Does Not Own | Key Boundary |
|---|---|---|---|---|
| Corpus Storage | Stores accepted program corpus and source materials used by programs. | Programs, topics, concepts, definitions, principles, accepted assessment items, assessment criteria, material references, source metadata, material storage references/copies. | Curator drafts, student attempts, student progress, role assignments, LLM suggestions before acceptance. | Only accepted content belongs here. Candidate material enters Corpus Storage only after curator acceptance. |
| Curator Workspace | Supports curator work on researching, assembling, refining, and accepting program content. | Research sources, candidate topics, candidate concepts, candidate materials, candidate checks, draft criteria, LLM-assisted suggestions, curator decisions. | Student learning history, student progress, learner assessment attempts, identity lifecycle, role assignments. | Curator work may prepare corpus changes, but does not become accepted corpus until accepted. |
| Student Workspace | Supports student participation in programs and personal learning state. | Enrolled programs, current learning position, learning sessions, answers, attempts, assessment feedback, evidence, mastery state, weak areas, review needs, personal history. | Accepted program corpus, curator drafts, role assignments, material storage ownership. | Student activity uses accepted corpus content but must not mutate it. |
| Identity & Role Management | Defines and manages identities, credentials, roles, and access boundaries. | Internal identities, credential bindings, product role assignments, admin role, role-management operations, access recovery. | Program content, curator acceptance decisions, learner state, assessment logic. | Defines who may act and under which role; does not own the workspaces’ domain state. |

## Product Role Rules

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

## Ownership Rules

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

| Concern | Responsibility | Covers | Does Not Own |
|---|---|---|---|
| Logging | Records operational and domain-relevant events for diagnosis and audit. | Identity changes, role assignments, curator decisions, assessment attempts, LLM operations, backup/restore events. | Product analytics, progress interpretation, user-facing learning state. |
| Observability | Exposes health and execution state of the Agonara instance and long-running operations. | Service health, failed jobs, LLM calls, ingestion, assessment evaluation, storage access, backup status. | Domain ownership, user permissions, program content. |
| Backup / Restore | Protects recoverability of Agonara data and configuration. | Corpus Storage, Curator Workspace, Student Workspace, Identity & Role Management, role assignments, material storage, operational configuration. | Content curation, assessment logic, product analytics interpretation. |
| Product Analytics | Captures product-usage and learning-behavior signals for improving Agonara. | Program usage, learning drop-offs, assessment friction, material usage, curator workflow usage. | Audit logging, operational health, authorization, formal progress state. |