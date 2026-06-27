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

- **Deletion decision (source + accepted).** The one open design question: hard delete vs.
  withdrawal for the source *record* (joint with "Authorized deletion of corpus sources" in
  the index) and for evidenced accepted content (joint with
  `docs/pre-adr/accepted-entity-withdrawal_pre_adr.md`). The spec covers raw-blob hard
  delete only and defers both.
- **Implementation plan** for the spec.
- **Implement + tests** against the spec's required tests (storage, content routes,
  `hasContent` navigation signal, backup/restore).
- **Product docs**: new curator/student stories, the STU-09/CUR-03 "linked or hosted"
  amendment, and the navigation spec #28 amendment.
- **Skills update**: teach `agonara-student` (read material content) and the curator corpus
  skill (load/read/delete content) the new capability.
