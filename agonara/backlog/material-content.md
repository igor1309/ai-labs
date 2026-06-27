---
date: 2026-06-27
model: claude-opus-4-8
description: "Forward tasks for in-product material content: storing material text and serving it role-gated, after ADR-021 and its spec."
---

# Backlog — Material Content

Material content storage (ADR-021) is **implemented**: storage, domain commands, HTTP
content routes, and the `/learn` reader + curator content form, with the spec marked
implemented (`docs/specs/material-content-storage.md`) and the plan archived
(`docs/plans/implemented/material-content-storage.md`). Remaining forward tasks:

## Forward tasks

- **Withdrawal/source-deletion spec + implementation** for
  `docs/adr/adr-022-accepted-entity-withdrawal-and-source-deletion.md` (entity `status`,
  withdraw/reactivate routes, two-tier source deletion, delivery/coverage filtering,
  backup/restore) — shared with the index source-deletion item. The material-content
  implementation covers raw-blob hard delete only.
- **Skills update**: teach `agonara-student` (read material content) and the curator corpus
  skill (load/read/delete content) the new capability.
