---
date: 2026-06-03
model: gpt-5
description: "Agonara backend and product docs for a structured learning program environment"
---

# Agonara

Structured learning program environment with backend/domain slices for Identity, Operations, Program Membership, Corpus curation, accepted topic/concept/material navigation, accepted checks, open-answer Student Workspace attempts and evaluation, and Quick Check assessment.

## Description

Helps curators assemble and maintain learning programs from trusted sources, while learners progress through them with clear sequence, checkpoints, and evidence of mastery. AI assists program construction and learning support but does not own the curriculum.

## Current Implementation Snapshot

Implemented backend, domain, and product surfaces:

- Identity and Operations: first-Admin bootstrap, local-password login, server-side sessions, Admin identity operations, audit reads, health, diagnostics, request correlation, completion logs, backup, and restore.
- Program Shell and Membership: Program creation, Student self-join/leave/rejoin, Student invitation lifecycle, participant listing, Student removal, curator leave, Admin exceptional recovery/revocation, effective participation checks, Program event reads, and Program Membership event reads.
- Corpus curation: Program sources, Corpus candidates, acceptance/rejection, accepted corpus revisions, Corpus event reads, and backup/restore support.
- Topic, concept, and material navigation: accepted topics, concepts, definitions, principles, material references, accepted relationships, historical revisions, curator navigation candidate routes, student-safe traversal routes, backup/restore validation, and `/learn` Curator/Student navigation UI.
- Accepted checks and criteria: assessment criteria, open-answer checks, accepted revisions, and curator/student/admin read separation.
- Student Workspace open answers: Student submission, idempotency, owner-only attempt detail/list reads, evaluation status/evidence reads, evaluator orchestration, worker execution, and backup/restore support.
- Quick Check assessment: session-backed HTTP routes, backend/domain and storage support for candidates, accepted revisions, protected answer keys, student-safe delivery projections, immutable attempts, matched evidence, backup/restore support, and a `/learn` product UI for Curator and Student Quick Check workflows.
- Learner-state interpretation: explicit target-link curation metadata, read-time owner-only progress and weak-area summaries, supporting-evidence target detail, HTTP routes, backup/restore preservation, and `/learn` Curator/Student learner-state UI.
- Topic and period readiness checks: accepted readiness definitions with topic or named-period scopes, evidence-backed explicit Student readiness attempts, idempotent retry, owner-only attempt reads, backup/restore support, HTTP routes, and `/learn` Curator/Student readiness UI.
- Curator coverage gaps: read-only Curator Workspace diagnostics over accepted Program corpus, session-backed Program Curator HTTP inspection, deterministic `draft_guidance` reports, protected redaction, and `/learn` Curator filtering and drill-down UI.
- LLM-assisted curation suggestions: Curator Workspace-owned deterministic-provider first slice for generating redacted draft suggestions, listing/detail origin inspection, accept/reject review, draft-candidate materialization without accepted-corpus promotion, backup/restore validation, HTTP routes, and `/learn` Program Curator review UI.
- Admin board: a local operations board for bootstrap, sign in/out, Identity management, operational access inspection, audit event inspection, and exceptional Program Membership recovery/revocation.

Still deferred or outside current product UI:

- Recommendation ranking and persisted mastery models still need separate specs or plans.
- Student-facing and curator-facing product UI beyond the `/learn` Quick Check, navigation, learner-state, readiness, membership, coverage-gap, and LLM suggestion first slices is not implemented.

## Key Separations

- **Program corpus** (topics, concepts, materials, checks, criteria) is owned by the curator
- **Student state** (answers, attempts, progress, weak areas) is owned by the learner
- **LLM output** is assistant material until a human accepts it
- **Identity** is the stable ownership and attribution subject
- **Admin** is instance-scoped operational authority, separate from program participation
- **Program Membership** owns program participation lifecycle and policy

## Stack

- Node.js 22 backend workspace
- SQLite persistence through `better-sqlite3`
- HTTP API with server-side sessions, CSRF protection, request correlation, health, diagnostics, and audit responses
- Operator CLI for bootstrap status and first-Admin bootstrap
- Docker image and Compose service for private self-hosted operation

## Demos

Local, Docker, and Admin board demo walkthroughs live in [`docs/demos.md`](docs/demos.md):

- **Identity Operations Demo** — bootstrap the first Admin via CLI, start the HTTP API, sign in, and exercise Admin operations with CSRF protection.
- **Docker Demo** — run the container and Compose service with persistent SQLite state.
- **Admin Board Demo** — drive the Admin operations board served at `/admin`.
