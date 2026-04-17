---
date: 2026-04-06
model: claude-opus-4-6
description: "Non-normative implementation notes for the Nexum implementer"
type: notes
status: open
origin: nexum-review-amendments-v0_1_0.md (Implementation Notes section)
---

# Nexum Implementation Notes

These items are not architectural decisions. They are implementation-level concerns that sit within the boundaries defined by the ADRs. Captured here so the implementer does not need to rediscover them from the source documents.

## Backend

### SnapshotBuilder input surface

The pure function receives three inputs: the entry list from RepoStore, per-entry metadata fetch results (success or failure), and the previous snapshot for fallback on failed fetches. The function signature and data types are an implementation design decision.

### Duplicate detection mechanism

RepoStore.add rejects duplicates. Whether this is a unique constraint on normalized `repo_url` in the DB (preferred — single source of enforcement) or an application-level findByUrl-then-insert check is an implementation decision. For single-user the difference is negligible, but a DB constraint is simpler and eliminates race conditions.

## Frontend

### In-flight requests on session teardown

When AuthInterceptor fires `onSessionLost` and the app graph tears down, pending effect handler work and in-flight HTTP requests need defined behavior. Options: cancel pending work, or let responses arrive and discard them. Either is acceptable — the decision should be explicit in implementation.
