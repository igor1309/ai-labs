---
date: 2026-05-27
model: gpt-5.5-thinking
description: "Deferred design decisions for Agonara."
version: 0.0.4
---

# Backlog

## Storage ownership

Storage is no longer wholly deferred. The implemented SQLite substrate now persists Identity, Admin authority, sessions, audit events, Program shells, Program Memberships, Program events, Corpus sources and accepted revisions, accepted assessment criteria, accepted open-answer checks, Student Workspace open-answer attempts/evaluation state, evaluator orchestration records, Quick Check accepted revisions, protected answer keys, Quick Check attempts, and backup/restore graphs.

Storage must still be derived from module responsibilities, not specified as an independent axis.

Remaining storage questions:

- How should future materials, topic graphs, concept graphs, and learning-path navigation records be modeled without mixing shared Program corpus with personal Student state?
- Which persisted learner-state summaries are allowed once progress and weak-area interpretation move beyond raw evidence?
- What invitation, recovery, and membership-policy history is needed for multi-user Program access without turning Admin authority into a Program role?
- Which future Quick Check UI artifacts, if any, need persisted learner-facing presentation state beyond the implemented HTTP/domain storage?

## Under consideration

Documents parked in an `under-consideration/` folder need an owning decision before downstream docs are revised. Do not let that folder go stale.

No active under-consideration documents.

When a parked document is resolved, move it out of `under-consideration/` (into `agonara/docs/` for accepted direction, or `archive/` if rejected) and log the decision in `agonara/docs/log.md`.
