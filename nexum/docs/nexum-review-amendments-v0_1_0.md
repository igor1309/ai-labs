---
title: "ADR: Nexum Architecture Review Amendments"
date: 2026-04-05
model: opus-4.6
version: 0.1.0
status: applied
type: adr
amends:
  - nexum-backend-adr-v0_3_0.md
  - nexum-frontend-adr-v0_2_0.md
  - nexum-openapi-v1.yml
references:
  - nexum-frontend-auth-adr-v0_1_0.md
  - nexum-backend-auth-adr-v0_1_0.md
---

# ADR: Nexum Architecture Review Amendments

## Context

Architecture review of the accepted ADRs, OpenAPI contract, and auth ADRs surfaced contradictions, underspecified areas, and contract changes. This document captures all resolutions from that review.

## 1. Add `findById` to RepoStore

### Problem

The `EditNote` use case receives an entry `id` from the PATCH endpoint. The published `RepoStore` surface has `findByUrl(url)` but no way to look up an entry by ID. This was flagged in the supersession note and remains unresolved. EditNote needs to verify the entry exists (returning 404 if not) before updating the note.

### Resolution

Add to the `RepoStore` protocol:

```
findById(id) → entry / not found
```

`EditNote` calls `findById` as its first step to validate the entry exists.

### Amended document

`nexum-backend-adr-v0_3_0.md` — RepoStore protocol surface.

---

## 2. Write operations: user transaction + snapshot rebuild as separate concerns

### Problem

The backend ADR preamble states write operations "rebuild the snapshot." The use case descriptions show incremental read-modify-write. These are different strategies. Additionally, the original "write-gates on metadata fetch" principle conflated two unrelated concerns: persisting what the user asked to save, and assembling a read model from external data.

### Resolution

The user's write and the snapshot rebuild are separate concerns.

**User transaction.** The user's action is "persist this repo URL and note" (AddRepo) or "update this note" (EditNote). This is the transaction boundary. It either commits or fails. GitHub availability has no bearing on it.

**Snapshot rebuild.** After the user transaction commits, a full snapshot rebuild follows. All entries are fetched from RepoStore. Metadata is fetched per-entry from MetadataSource on a best-effort basis — for every entry, including newly added ones:

- Successful fetch → fresh metadata in snapshot.
- Failed fetch → last-known metadata from the previous snapshot is preserved for that entry.
- No previous metadata (new entry, first fetch failed) → metadata fields are null in the snapshot.

SnapshotBuilder receives the entry list, the per-entry fetch results, and the previous snapshot for fallback.

### Supersedes: write-gates on metadata fetch

The backend ADR's principle "Write-gates on external fetch" is removed. It no longer applies. The user's write does not depend on GitHub. The snapshot rebuild is best-effort across the board.

### Consequences

- The user always gets confirmation that their save succeeded.
- An entry with failed metadata appears in the snapshot with URL, note, and addedAt intact, but null name, stars, and description. The UI renders this honestly — the entry is visible, and the empty fields signal that metadata is not yet available.
- The next successful rebuild fills in the metadata.
- Concurrency on snapshot writes is safe: every write produces a complete snapshot from current state.
- Write latency scales with collection size (N metadata fetches). Acceptable for a personal single-user collection.
- If the rebuild itself fails (e.g. DB error writing the snapshot), the entry is persisted but the snapshot is stale. This is acceptable — the next successful write produces a full rebuild from current state and resolves the inconsistency.

### Amended use cases

**AddRepo(repoStore, metadataSource, snapshotStore)**

1. Normalize URL
2. Check for duplicate via RepoStore — fail = 409
3. Add entry via RepoStore (URL, note, addedAt)
4. Rebuild snapshot:
   a. Read previous snapshot via SnapshotStore
   b. List all entries via RepoStore
   c. Fetch metadata for each entry via MetadataSource (best-effort; fall back to previous snapshot per entry; null if no previous metadata)
   d. Build complete snapshot via SnapshotBuilder
   e. Write snapshot via SnapshotStore
5. Return snapshot

**EditNote(repoStore, metadataSource, snapshotStore)**

1. Find entry by ID via RepoStore — fail = 404
2. Update note via RepoStore
3. Rebuild snapshot (same as AddRepo step 4)
4. Return snapshot

**GetRepos(snapshotStore)** — unchanged. Pure read.

### Amended document

`nexum-backend-adr-v0_3_0.md` — use case descriptions, removal of write-gating principle.

---

## 3. API contract schema changes

### Problem

Two schema issues in `RepoEntry`:

- `metadataFetchedAt` is present in the schema but undefined in any ADR. Its source and semantics are unspecified.
- `name` and `stars` are required non-nullable. With the best-effort metadata policy (amendment #2), an entry can exist in the snapshot without metadata — these fields need to accommodate the empty case.

### Resolution

**Drop `metadataFetchedAt`.** Remove it from `RepoEntry`. Not needed for v1. If per-entry fetch freshness tracking is needed later, reintroduce it with defined semantics via a contract revision.

**Make `name` and `stars` nullable.** Null means "metadata has not been successfully fetched." This is distinct from empty string (name exists but is empty) or zero (repo actually has zero stars). `description` is already nullable.

Updated `RepoEntry` required fields: `id`, `repoUrl`, `note`, `addedAt`. The metadata fields (`name`, `stars`, `description`) are all nullable.

### Amended document

`nexum-openapi-v1.yml` — `RepoEntry` schema.

---

## 4. App state machine initial load

### Problem

No document specifies how the app state machine gets its first data after authentication.

### Resolution

The two-phase composition root (from the frontend auth ADR) constructs the app state machine in phase 2 when entering the `authenticated` state. The factory builds and returns the fully wired state machine. The caller — the auth state machine's authenticated-entry logic — dispatches `.load` on the returned object.

This triggers the standard effect handler path: `getRepos()` → `GET /repos` → response replaces `repoTable`.

The state machine starts with an empty `repoTable` and `fetchState: loading`. The UI renders accordingly (empty table with loading indicator).

### Backend: empty snapshot case

When `GET /repos` arrives and no snapshot row exists (first use, or after a data reset), `SnapshotStore.read()` returns an empty snapshot: `{ repos: [] }`. This is handled in the concrete `SnapshotStore` implementation, not as a special case in the use case or contract. The response shape is identical — an empty array.

### Amended documents

`nexum-frontend-adr-v0_2_0.md` — state machine initialization.
`nexum-frontend-auth-adr-v0_1_0.md` — phase 2 composition root behavior.

---

## 5. Backend auth identity type

### Problem

`AuthVerifier` returns `Identity | Rejection`. The contents of `Identity` are unspecified.

### Resolution

`Identity` carries the `sub` claim from the JWT. The router does not check it against an allowed-user list. Any valid JWT issued by the configured auth provider is sufficient to access all endpoints.

Single-user enforcement is a deployment concern: only one account exists in the auth provider. The application does not enforce it.

If Nexum ever moves to multi-user, `Identity.sub` is already available for authorization checks. Those checks would be introduced at that point, not now.

### Amended document

`nexum-backend-auth-adr-v0_1_0.md` — AuthVerifier contract.

---

## 6. No DELETE endpoint in v1

### Problem

No endpoint for removing a repo entry exists. No document states whether this is intentional.

### Resolution

DELETE is explicitly out of scope for v1. It will be introduced in v2.

No amendment needed — this is a scope statement, not an architecture change. Recorded here for traceability.

---

## Implementation Notes

The following items are not architectural decisions. They are implementation-level concerns that sit within the boundaries defined by the ADRs. Captured here so the implementation planner does not need to rediscover them from the source documents.

### Backend

- **SnapshotBuilder input surface.** The pure function now receives three inputs: the entry list from RepoStore, per-entry metadata fetch results (success or failure), and the previous snapshot for fallback on failed fetches. The function signature and data types are an implementation design decision.
- **Duplicate detection mechanism.** RepoStore.add rejects duplicates. Whether this is a unique constraint on normalized `repoUrl` in the DB (preferred — single source of enforcement) or an application-level findByUrl-then-insert check is an implementation decision. For single-user the difference is negligible, but a DB constraint is simpler and eliminates race conditions.

### Frontend

- **In-flight requests on session teardown.** When AuthInterceptor fires `onSessionLost` and the app graph tears down, pending effect handler work and in-flight HTTP requests need defined behavior. Options: cancel pending work, or let responses arrive and discard them. Either is acceptable — the decision should be explicit in implementation.
- **Auth method choice.** The auth ADR is provider-agnostic at the architecture level. The concrete auth method (email/password, magic link, OAuth) is a product decision that blocks login UI implementation. Must be decided before frontend implementation begins.
- **SessionResolver validation depth.** Does SessionResolver check only for token existence in persistent storage, or does it also inspect local expiry? Given the "backend is arbiter" principle, storage-existence-only is sufficient. However, skipping straight to the login screen when the token is clearly expired (exp claim in the past) is better UX than resolving to authenticated and immediately hitting a 401. Worth a deliberate choice during implementation.