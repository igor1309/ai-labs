---
date: 2026-06-27
model: claude-opus-4-8
description: "Forward tasks for in-product material content: storing material text and serving it role-gated, after ADR-021 and its spec."
---

# Backlog — Material Content

Make material content readable in-product: a `Program Curator` reads/writes/deletes
everything they load, a `Student` reads accepted content. Decided and specified —
licensing is the curator's responsibility, accepted content is a self-contained immutable
copy. Reasoning and contract live in
`docs/adr/adr-021-material-content-storage-and-role-gated-reading.md`,
`docs/pre-adr/material-content-access_pre_adr.md`, and the spec
`docs/specs/material-content-storage.md`.

## Forward tasks

- **Deletion** — decided in
  `docs/adr/adr-022-accepted-entity-withdrawal-and-source-deletion.md` (two-tier source
  deletion; evidenced accepted content retired by withdrawal). Needs its own spec +
  implementation (tracked with the withdrawal work, below); the material-content spec
  covers raw-blob hard delete only.
- **Implement + tests** following the drafted plan
  `docs/plans/material-content-storage.md` (storage → domain → HTTP → `/learn` UI →
  docs/closeout), against the spec's required tests.
- **Withdrawal/source-deletion spec + implementation** for ADR-022 (entity `status`,
  withdraw/reactivate routes, two-tier source deletion, delivery/coverage filtering,
  backup/restore) — shared with the index source-deletion item.
- **Product docs**: new curator/student stories, the STU-09/CUR-03 "linked or hosted"
  amendment, and the navigation spec #28 amendment.
- **Skills update**: teach `agonara-student` (read material content) and the curator corpus
  skill (load/read/delete content) the new capability.
