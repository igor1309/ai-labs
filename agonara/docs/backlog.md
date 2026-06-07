---
date: 2026-06-07
model: gpt-5
description: "Deferred design decisions for Agonara."
version: 0.0.6
---

# Backlog

## Skill–contract drift guard

The BYOA operator skills under `skills/` are pure documentation: they cite
concrete `docs/api/openapi.yml` paths, headers, and request fields, but nothing
in CI fails when a contract change renames or removes a path a skill still
teaches. Today this is caught only by manual G1 spot-checks at authoring time,
so a later contract edit can silently leave a skill teaching a dead route —
across `agonara-api-access`, `agonara-membership`, `agonara-student`, and every
future role skill.

Open question: what is the lightest guard worth its maintenance cost — a
path-existence test that extracts the `/...` routes a SKILL.md cites and asserts
each resolves in `openapi.yml`, a scheduled `doc-drift-audit` pass over
`skills/`, or accepting manual review? A test must tolerate prose that mentions
paths illustratively without over-fitting to phrasing.

## Future product-state decisions

Storage ownership is no longer deferred as a standalone decision axis. The
implemented SQLite substrate persists Identity, Admin authority, sessions, audit
events, Program shells, Program Memberships, Program invitations, Program
membership events, Corpus sources and accepted revisions, accepted
topic/concept/material navigation graphs, accepted assessment criteria, accepted
open-answer checks, Student Workspace open-answer attempts/evaluation state,
evaluator orchestration records, Quick Check accepted revisions, protected
answer keys, Quick Check attempts, accepted readiness definitions, explicit
readiness attempts, redacted LLM curation suggestion records, and backup/restore
graphs.

Future persisted state must be introduced only through the owning module's
responsibility, spec, and acceptance rules.

Open questions:

- Which future learning-path sequencing or recommendation records are needed
  beyond the implemented accepted topic/concept/material graph, and how do they
  stay separate from personal Student state?
- Which invalidated learner-state cache records, if any, are worth adding beyond
  the implemented read-time progress and weak-area derivation?
- Which future membership-policy variants, if any, are needed beyond implemented
  Student self-join and invitation-only access without turning Admin authority
  into a Program role?
- Which future `/learn` UI artifacts, if any, need persisted learner-facing
  presentation state beyond the implemented Quick Check, navigation,
  learner-state, readiness, membership, Curator coverage-gap, and Curator LLM
  suggestion first slices?

## Under consideration

Documents parked in an `under-consideration/` folder need an owning decision before downstream docs are revised. Do not let that folder go stale.

No active under-consideration documents.

When a parked document is resolved, move it out of `under-consideration/` (into `agonara/docs/` for accepted direction, or `archive/` if rejected) and log the decision in `agonara/docs/log.md`.
