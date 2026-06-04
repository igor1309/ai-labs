---
date: 2026-05-27
model: gpt-5.5-thinking
description: "Deferred design decisions for Agonara."
version: 0.0.4
---

# Backlog

## Storage ownership

Storage is no longer wholly deferred. The implemented SQLite substrate now persists Identity, Admin authority, sessions, audit events, Program shells, Program Memberships, Program invitations, Program membership events, Corpus sources and accepted revisions, accepted topic/concept/material navigation graphs, accepted assessment criteria, accepted open-answer checks, Student Workspace open-answer attempts/evaluation state, evaluator orchestration records, Quick Check accepted revisions, protected answer keys, Quick Check attempts, accepted readiness definitions, explicit readiness attempts, and backup/restore graphs.

Storage must still be derived from module responsibilities, not specified as an independent axis.

Remaining storage questions:

- Which future learning-path sequencing or recommendation records are needed beyond the implemented accepted topic/concept/material graph, and how do they stay separate from personal Student state?
- Which invalidated learner-state cache records, if any, are worth adding beyond the implemented read-time progress and weak-area derivation?
- Which future membership-policy variants, if any, are needed beyond implemented Student self-join and invitation-only access without turning Admin authority into a Program role?
- Which future `/learn` UI artifacts, if any, need persisted learner-facing presentation state beyond the implemented Quick Check, navigation, learner-state, and readiness first slices?

## Under consideration

Documents parked in an `under-consideration/` folder need an owning decision before downstream docs are revised. Do not let that folder go stale.

No active under-consideration documents.

When a parked document is resolved, move it out of `under-consideration/` (into `agonara/docs/` for accepted direction, or `archive/` if rejected) and log the decision in `agonara/docs/log.md`.
