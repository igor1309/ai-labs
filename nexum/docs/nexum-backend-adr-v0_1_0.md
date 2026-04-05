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

All three endpoints return the full snapshot on success. Write operations (POST, PATCH) rebuild the snapshot as part of their flow.

### Outbound

The backend consumes two external systems:

- **Database** — persistence for repo entries and the snapshot blob
- **GitHub API** — repo metadata fetch

Per "client owns interfaces," the backend defines the protocols it needs from each. Concrete implementations are behind those protocols.

## Internal Architecture

### Async Collaborators

Three protocol-level collaborators handle all async work:

**RepoStore** — stateful, persistence.
- add(url, note) → entry / duplicate(existingId)
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

**SnapshotBuilder** — merges repo entry data with metadata into the snapshot blob. No dependencies, no protocols. Tested with plain data.

**normalizeUrl** — lowercase, strip trailing slash, strip `.git`. A domain rule, not a storage concern. Tested independently.

### Write Gating

Both write operations (POST, PATCH) gate on GitHub metadata fetch success. If the fetch fails, the entire operation fails — neither the repo entry nor the snapshot is updated. This guarantees that every entry in the snapshot has valid metadata.

### Use Cases

One per endpoint. Each orchestrates the async collaborators and pure functions, and returns the snapshot on success.

**AddRepo(repoStore, metadataSource, snapshotStore)**
1. Normalize URL
2. Fetch metadata via MetadataSource — fail = fail the operation
3. Add entry via RepoStore (rejects duplicate)
4. Read existing snapshot via SnapshotStore
5. Append new entry with metadata via SnapshotBuilder
6. Write snapshot via SnapshotStore
7. Return snapshot

**GetRepos(snapshotStore)**
Pure read. Returns current snapshot from SnapshotStore. No side effects.

**EditNote(repoStore, metadataSource, snapshotStore)**
1. Fetch metadata via MetadataSource for this entry — fail = fail the operation
2. Update note via RepoStore
3. Read existing snapshot via SnapshotStore
4. Update entry in snapshot: new note + fresh metadata via SnapshotBuilder
5. Write snapshot via SnapshotStore
6. Return snapshot

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

The backend is built and deployed independently. The composition root constructs the full dependency graph on each invocation. The runtime environment (long-lived server, serverless function, edge function) is a deployment decision — the architecture does not depend on it. If the chosen runtime supports the composition pattern, it works. If not, the deployment choice is reconsidered, not the architecture.

## Key Principles

- **Client owns interfaces.** The frontend's OpenAPI schema defines the inbound contract. The backend defines the outbound protocols it needs from the database and GitHub.
- **Purely reactive.** No cron, no background jobs. All behavior is triggered by inbound requests.
- **Write-gates on external fetch.** Repo and snapshot are updated only on GitHub success. No entry ever exists without valid metadata.
- **Dependency inversion.** Use cases depend on protocols, not implementations. RepoStore, SnapshotStore, MetadataSource are protocols — concrete implementations are wired at the composition root.
- **Pure functions for domain logic.** Snapshot assembly and URL normalization are pure, stateless, dependency-free. Tested independently.
- **Single responsibility.** Use cases orchestrate. Stores persist. MetadataSource reads external data. Routing maps HTTP to use cases. Each has one reason to change.
- **Composition over configuration.** All wiring happens at the composition root. No service locators, no singletons, no ambient state.