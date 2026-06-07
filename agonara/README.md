---
date: 2026-06-07
model: gpt-5
description: "Agonara backend and product docs for a BYOA learning program environment"
---

# Agonara

**Bring-your-own-agent (BYOA)** learning program environment for turning
scattered study into structured progress: serious self-directed learners and
program curators bring their own agent to shape sources into curated programs,
connect materials and concepts, run checks, and keep progress grounded in
evidence.

Backend/domain slices cover Identity, Operations, Program Membership, Corpus curation, accepted topic/concept/material navigation, accepted checks, open-answer Student Workspace attempts and evaluation, and Quick Check assessment.

## Description

Serious learning breaks down when materials, concepts, and proof of understanding live in separate piles. Agonara gives people a program-shaped workspace for turning that scatter into a path they can follow, revise, and verify.

Agonara is **bring-your-own-agent (BYOA)**: point the agent you already use at your Agonara instance and follow role-specific guidance for curating programs, learning through them, and managing the private instance. The agent helps with the workflow, while accepted program content and use of learning evidence remain human responsibilities.

The `/learn` and `/admin` browser UIs and the operator CLI remain first-class clients of the same backend contracts. This keeps program, corpus, membership, assessment, and learner-state behavior automatable without coupling it to one UI. BYOA refines the existing API-first intent; it does not change the product — agents can help draft, evaluate, and carry out the workflow, but accepted program content remains a human decision.

## Landing Pages

- [`index.html`](index.html) — project landing: how to use it, running a private instance, the implementation snapshot, and product surfaces.
- [`architecture.html`](architecture.html) — architecture deep dive (progressive disclosure from the landing): module responsibility map, ownership rules, runtime, deployment, and ADR index.
- [`docs/positioning.md`](docs/positioning.md) — positioning baseline for scattered study, structured progress, BYOA operation, and human-owned curation.
- [`docs/intent/user-stories.html`](docs/intent/user-stories.html) — user stories driving the product.

## API Contract

- [`docs/api/openapi.yml`](docs/api/openapi.yml) — canonical route-level OpenAPI 3.1 contract for implemented HTTP surfaces, shared envelopes, session cookie auth, CSRF, idempotency, and common rejection reasons.

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
- API-first HTTP backend with server-side sessions, CSRF protection, request correlation, health, diagnostics, and audit responses
- Operator CLI for bootstrap status and first-Admin bootstrap
- Docker image and Compose service for private self-hosted operation

## Demos

Local, Docker, and Admin board demo walkthroughs live in [`docs/demos.md`](docs/demos.md):

- **Identity Operations Demo** — bootstrap the first Admin via CLI, start the HTTP API, sign in, and exercise Admin operations with CSRF protection.
- **Docker Demo** — run the container and Compose service with persistent SQLite state.
- **Admin Board Demo** — drive the Admin operations board served at `/admin`.
