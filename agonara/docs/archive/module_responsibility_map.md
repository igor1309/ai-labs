---
title: Agonara Module Responsibility Map
description: Initial module responsibility map for Agonara architecture discussion.
model: gpt-5.5-thinking
version: 0.1.0
---

# Agonara Module Responsibility Map

## Purpose

This document defines the initial responsibility boundaries between major Agonara modules.

It is not a workflow map, dependency map, data model, storage design, or implementation plan.

## Responsibility Map

| Module | Responsibility | Owns | Does Not Own |
|---|---|---|---|
| Program Corpus | Holds accepted program content. | Programs, topics, concepts, definitions, principles, materials linked to the program, checks, assessment criteria. | Curator drafts, LLM suggestions before acceptance, student answers, student progress, assessment attempts. |
| Curation Workspace | Supports curator work on collecting, refining, and accepting program content. | External sources, research findings, candidate topics, candidate concepts, candidate materials, candidate checks, curator decisions. | Student learning history, student progress, accepted corpus after transfer into Program Corpus. |
| Learner Workspace | Supports personal program проходжение by a student. | Selected or started programs, current learning position, learning sessions, answers, attempts, personal history. | Program content, curator drafts, source materials as shared resources. |
| Assessment | Evaluates concrete student answers against defined checks and criteria. | Submitted answer evaluation, feedback, evidence produced from an attempt. | Accepted program content, student-wide mastery state, curator acceptance decisions. |
| Progress Interpretation | Interprets assessment evidence into student learning state. | Mastery state, weak areas, needs-review state, readiness signals. | Raw assessment item definitions, curator drafts, accepted program content. |
| Material Storage | Stores and provides access to source materials. | Links, local copies, source metadata, extracted fragments where needed. | Acceptance of material into a program, student progress, assessment evaluation. |
| Identity & Roles | Defines who acts in the system and under which role. | Student role, curator role, combined student-curator mode, role-specific access boundaries. | Learning content, assessment logic, material curation. |
| Identity & Role Management | Manages identities, role assignments, credential bindings, and admin-level access operations. | Identity lifecycle, role assignment, credential binding, access recovery, admin operations. | Program content, curator acceptance decisions, learner state, assessment logic. |
| LLM Assistance | Provides auxiliary generation, extraction, structuring, and evaluation support. | Draft suggestions, candidate structures, candidate questions, candidate criteria, draft answer evaluations. | Final acceptance of program content, ownership of program corpus, final student mastery interpretation. |

## Cross-cutting Responsibilities

| Concern | Responsibility | Covers | Does Not Own |
|---|---|---|---|
| Logging | Records operational and domain-relevant events for diagnosis and audit. | Identity changes, role assignments, curator decisions, assessment attempts, LLM operations, backup/restore events. | Product analytics, progress interpretation, user-facing learning state. |
| Observability | Exposes health and execution state of the Agonara instance and long-running operations. | Service health, failed jobs, LLM calls, ingestion, assessment evaluation, storage access, backup status. | Domain ownership, user permissions, program content. |
| Backup / Restore | Protects recoverability of Agonara data and configuration. | Program Corpus, Curation Workspace, Learner State, Identity & Roles, role assignments, Material Storage, operational configuration. | Content curation, assessment logic, product analytics interpretation. |
| Product Analytics | Captures product-usage and learning-behavior signals for improving Agonara. | Program usage, learning drop-offs, assessment friction, material usage, curator workflow usage. | Audit logging, operational health, authorization, formal progress state. |

## Identity & Roles Decision

### Decision

Agonara separates identity, product roles, operational roles, and credentials.

An **Identity** is the internal subject of ownership and action in Agonara.

Product roles define how an Identity participates in a program:

- `Student` — passes a program and owns learner state within that program.
- `Program Curator` — curates a program and owns curator decisions within that program.

Product roles are **program-scoped**. The same Identity may be a Student in one program, a Program Curator in another, or both within the same program.

`Admin` is an **operational role**. It is instance-scoped and manages identities, role assignments, credential bindings, settings, and recovery-level operations.

`Admin` is not a learning role and does not replace Program Curator ownership of accepted program content.

Credentials and external accounts are bindings to internal Identity. They are not the source of Agonara ownership.

### Selected Design Choices

| Axis | Selected value |
|---|---|
| Identity Source | Internal Identity |
| Product Role Scope | Program-scoped product roles |
| Operational Role | Admin only |

### Ownership Rules

| Area | Owner |
|---|---|
| Accepted Program Corpus | Program |
| Learner State | Identity acting as Student within a Program |
| Curator Decisions | Identity acting as Program Curator within a Program |
| Credentials / External Accounts | Identity & Role Management |
| Role Assignments | Identity & Role Management |

## Boundary Notes

### Program Corpus vs Curation Workspace

The Program Corpus contains accepted program content.

The Curation Workspace contains working material: sources, research findings, drafts, candidates, and LLM suggestions.

A candidate becomes part of the Program Corpus only after curator acceptance.

### Program Corpus vs Learner Workspace

The Program Corpus defines what can be studied and checked.

The Learner Workspace records what a specific student has done with that program.

Student state must not mutate the accepted program content.

### Assessment vs Progress Interpretation

Assessment evaluates a concrete answer or attempt.

Progress Interpretation decides what that evidence means for the student’s broader learning state.

### Material Storage vs Program Corpus

Material Storage can contain sources that are not yet part of any accepted program.

A material becomes part of a program only through Program Corpus linkage.

### LLM Assistance vs Ownership

LLM Assistance can propose, extract, structure, and evaluate within a given frame.

It does not accept program content, own the corpus, or independently declare student mastery.