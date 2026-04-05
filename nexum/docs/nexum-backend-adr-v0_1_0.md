---
title: "ADR: Nexum Backend Architecture"
date: 2026-04-05
model: opus-4.6
version: 0.1.0
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
- `GET /repos` — read the full snapshot array
- `PATCH /repos/{id}/note` — edit a repo's note

There are no scheduled jobs, cron triggers, or other inbound interfaces. All behavior — including metadata refresh — is a side effect of inbound requests.

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

**SnapshotBuilder** — takes repo entries + metadata in, produces the snapshot blob out. No dependencies, no protocols. Tested with plain data.

**normalizeUrl** — lowercase, strip trailing slash, strip `.git`. A domain rule, not a storage concern. Tested independently.

### Use Cases

One per endpoint. Each orchestrates the async collaborators and pure functions.

**AddRepo(repoStore, metadataSource, snapshotStore)**
1. Normalize URL
2. Call RepoStore to persist (rejects duplicate)
3. Call MetadataSource to fetch metadata
4. Call SnapshotBuilder to assemble blob
5. Call SnapshotStore to write

**GetRepos(repoStore, metadataSource, snapshotStore)**
1. Call SnapshotStore to read current blob (return immediately for rendering)
2. Call RepoStore to list entries
3. Call MetadataSource to fetch metadata per entry
4. Call SnapshotBuilder to assemble updated blob
5. Call SnapshotStore to write
6. Return updated blob

**EditNote(repoStore, snapshotStore)**
1. Call RepoStore to update note
2. Call SnapshotBuilder to assemble updated blob
3. Call SnapshotStore to write

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
GetRepos(repoStore, metadataSource, snapshotStore)
EditNote(repoStore, snapshotStore)

Router(addRepo, getRepos, editNote)
```

Cross-cutting concerns (logging, error mapping, auth verification) are composed here — as collaborator decorators, use case wrappers, or router middleware.

### Deployment

The backend is built and deployed independently. The composition root constructs the full dependency graph on each invocation. The runtime environment (long-lived server, serverless function, edge function) is a deployment decision — the architecture does not depend on it. If the chosen runtime supports the composition pattern, it works. If not, the deployment choice is reconsidered, not the architecture.

## Key Principles

- **Client owns interfaces.** The frontend's OpenAPI schema defines the inbound contract. The backend defines the outbound protocols it needs from the database and GitHub.
- **Purely reactive.** No cron, no background jobs. All behavior is triggered by inbound requests.
- **Dependency inversion.** Use cases depend on protocols, not implementations. RepoStore, SnapshotStore, MetadataSource are protocols — concrete implementations are wired at the composition root.
- **Pure functions for domain logic.** Snapshot assembly and URL normalization are pure, stateless, dependency-free. Tested independently.
- **Single responsibility.** Use cases orchestrate. Stores persist. MetadataSource reads external data. Routing maps HTTP to use cases. Each has one reason to change.
- **Composition over configuration.** All wiring happens at the composition root. No service locators, no singletons, no ambient state.