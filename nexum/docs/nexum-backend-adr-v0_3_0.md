---
title: "ADR: Nexum Backend Architecture"
date: 2026-04-05
model: opus-4.6
version: 0.3.0
status: accepted
type: adr
---

# ADR: Nexum Backend Architecture

## Context

Nexum is a private single-user repo memory system. The backend is one of two separately built and deployed components. This ADR locks the backend's external interfaces and internal architecture.

## External Interfaces

### Inbound

The backend is purely reactive. It responds to three REST endpoints defined by the locked OpenAPI schema (`nexum-openapi-v1.yaml`):

- `POST /repos` — add a new repo entry
- `GET /repos` — read the current snapshot
- `PATCH /repos/{id}/note` — edit a repo's note

There are no scheduled jobs, cron triggers, or other inbound interfaces.

All three endpoints return the full snapshot on success. Write operations (POST, PATCH) commit the user's change first, then perform a full snapshot rebuild with best-effort metadata.

### Outbound

The backend consumes two external systems:

- **Database** — persistence for repo entries and the snapshot blob
- **GitHub API** — repo metadata fetch

Per "client owns interfaces," the backend defines the protocols it needs from each. Concrete implementations are behind those protocols.

## Internal Architecture

### Async Collaborators

Three protocol-level collaborators handle all async work:

**RepoStore** — stateful, persistence. An entry contains at minimum: `id`, `repoUrl`, `note`, `addedAt`.
- add(url, note) → entry / duplicate(existingId)
- findById(id) → entry / not found
- findByUrl(url) → entry / not found
- updateNote(id, note) → success / not found
- list() → [entry]

**SnapshotStore** — stateful, persistence.
- read() → snapshot blob
- write(blob) → success

**MetadataSource** — stateless, external read.
- fetch(url) → metadata (name, stars, description) / error

All three are protocols. Concrete implementations are wired at the composition root.

### Pure Functions

**SnapshotBuilder** — builds the complete snapshot from the entry list, per-entry metadata fetch results (success or failure), and the previous snapshot for fallback on failed fetches. No dependencies, no protocols. Tested with plain data.

**normalizeUrl** — lowercase, strip trailing slash, strip `.git`. A domain rule, not a storage concern. Tested independently.

### Write Model

Write operations separate the user transaction from the snapshot rebuild.

**User transaction.** The user's action is "persist this repo URL and note" (AddRepo) or "update this note" (EditNote). This is the transaction boundary. It either commits or fails. GitHub availability has no bearing on it.

**Snapshot rebuild.** After the user transaction commits, a full snapshot rebuild follows. All entries are fetched from RepoStore. Metadata is fetched per-entry from MetadataSource on a best-effort basis:

- Successful fetch → fresh metadata in snapshot.
- Failed fetch → last-known metadata from the previous snapshot is preserved for that entry.
- No previous metadata (new entry, first fetch failed) → metadata fields are null in the snapshot.

### Use Cases

One per endpoint. Each orchestrates the async collaborators and pure functions, and returns the snapshot on success.

**AddRepo(repoStore, metadataSource, snapshotStore)**
1. Normalize URL
2. Add entry via RepoStore (normalized URL, note, addedAt) — rejects duplicate with existingId = 409
3. Rebuild snapshot:
   a. Read previous snapshot via SnapshotStore
   b. List all entries via RepoStore
   c. Fetch metadata for each entry via MetadataSource (best-effort; fall back to previous snapshot per entry; null if no previous metadata)
   d. Build complete snapshot via SnapshotBuilder
   e. Write snapshot via SnapshotStore
4. Return snapshot

**GetRepos(snapshotStore)**
Pure read. Returns current snapshot from SnapshotStore. No side effects.

**EditNote(repoStore, metadataSource, snapshotStore)**
1. Find entry by ID via RepoStore — fail = 404
2. Update note via RepoStore
3. Rebuild snapshot (same as AddRepo step 4)
4. Return snapshot

### Routing

Maps inbound HTTP requests to use cases. Handles request parsing, auth verification, and response serialization (including the uniform error envelope). Contains no business logic.

### Composition Root

The app entry point wires everything:

```
ConcreteDBClient
       │
       ├──▶ RepoStore(dbClient)
       └──▶ SnapshotStore(dbClient)

ConcreteHTTPClient
       │
       └──▶ MetadataSource(httpClient)

AddRepo(repoStore, metadataSource, snapshotStore)
GetRepos(snapshotStore)
EditNote(repoStore, metadataSource, snapshotStore)

Router(addRepo, getRepos, editNote)
```

Cross-cutting concerns (logging, error mapping, auth verification) are composed here — as collaborator decorators, use case wrappers, or router middleware.

### Deployment

The backend is a single Supabase Edge Function. The composition root runs once at module load time — the wired dependency graph lives for the lifetime of the deployed instance. The internal router maps requests to use cases.

The function is served at Supabase's base URL (`/functions/v1/<function-name>`). The OpenAPI contract paths (`/repos`, `/repos/{id}/note`) are relative to this base. The base URL is frontend configuration, not a backend concern.

Pipeline: merge → GitHub Actions runs tests → build artifact → deploy to Supabase. CI/CD conventions inherited from the ai-labs monorepo.

## Key Principles

- **Client owns interfaces.** The frontend's OpenAPI schema defines the inbound contract. The backend defines the outbound protocols it needs from the database and GitHub.
- **Purely reactive.** No cron, no background jobs. All behavior is triggered by inbound requests.
- **User transaction separate from snapshot rebuild.** The user's write (add/edit) commits independently of GitHub. The snapshot rebuild is best-effort — failed metadata falls back to the previous snapshot or null.
- **Dependency inversion.** Use cases depend on protocols, not implementations. RepoStore, SnapshotStore, MetadataSource are protocols — concrete implementations are wired at the composition root.
- **Pure functions for domain logic.** Snapshot assembly and URL normalization are pure, stateless, dependency-free. Tested independently.
- **Single responsibility.** Use cases orchestrate. Stores persist. MetadataSource reads external data. Routing maps HTTP to use cases. Each has one reason to change.
- **Composition over configuration.** All wiring happens at the composition root. No service locators, no singletons, no ambient state.