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

The backend is purely reactive. It responds to four REST endpoints defined by the locked OpenAPI schema (`nexum-openapi-v1.yml`):

- `POST /auth/login` — authenticate and obtain a bearer token (unauthenticated)
- `POST /repos` — add a new repo entry
- `GET /repos` — read the current snapshot
- `PATCH /repos/{id}/note` — edit a repo's note

There are no scheduled jobs, cron triggers, or other inbound interfaces.

The repo endpoints return the full snapshot on success. Write operations (POST, PATCH) commit the user's change first, then perform a full snapshot rebuild with best-effort metadata.

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

### Auth Collaborators

Two stateless protocol-level collaborators support the login use case:

**CredentialVerifier** — verifies a username/password pair against the configured account.
- verify(username, password) → verified / rejected

**TokenIssuer** — issues a signed JWT for a verified identity.
- issue(identity) → token, expiresAt

Both are protocols. Concrete implementations are wired at the composition root. The concrete `CredentialVerifier` reads `AUTH_USERNAME` and `AUTH_PASSWORD_HASH` (bcrypt) from configuration and performs the bcrypt comparison. The concrete `TokenIssuer` signs a HS256 JWT using `JWT_SECRET` with a 24-hour expiry.

### Pure Functions

**SnapshotBuilder** — builds the complete snapshot from the entry list, per-entry metadata fetch results (success or failure), and the previous snapshot for fallback on failed fetches. No dependencies, no protocols. Tested with plain data.

**normalizeUrl** — validates and normalizes a GitHub repository URL. Validation: must match `https://github.com/{owner}/{repo}` after normalization (lowercase scheme+host, strip trailing slash, strip `.git`). Exactly two non-empty path segments required. No query or fragment allowed. Rejects with 400 on failure. A domain rule, not a storage concern. Tested independently.

### Write Model

Write operations separate the user transaction from the snapshot rebuild.

**User transaction.** The user's action is "persist this repo URL and note" (AddRepo) or "update this note" (EditNote). This is the transaction boundary. It either commits or fails. GitHub availability has no bearing on it.

**Snapshot rebuild.** After the user transaction commits, a full snapshot rebuild follows. All entries are fetched from RepoStore. Metadata is fetched per-entry from MetadataSource on a best-effort basis:

- Successful fetch → fresh metadata in snapshot.
- Failed fetch → last-known metadata from the previous snapshot is preserved for that entry.
- No previous metadata (new entry, first fetch failed) → metadata fields are null in the snapshot.

### Use Cases

One per endpoint. Each orchestrates the async collaborators and pure functions, and returns the snapshot on success.

**Login(credentialVerifier, tokenIssuer)**
1. Verify credentials via CredentialVerifier — fail = 401
2. Issue token via TokenIssuer
3. Return { token, expiresAt }

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

Auth verification (`authVerifier`) is applied to every route **except** `POST /auth/login`. The login route is explicitly unauthenticated — it is the endpoint that produces the token. The router dispatches it to the `Login` use case directly, without calling `authVerifier`.

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

CredentialVerifier(config)   ← reads AUTH_USERNAME, AUTH_PASSWORD_HASH
TokenIssuer(config)          ← reads JWT_SECRET

AuthVerifier(config)         ← reads JWT_SECRET, verifies HS256 signature + expiry

Login(credentialVerifier, tokenIssuer)
AddRepo(repoStore, metadataSource, snapshotStore)
GetRepos(snapshotStore)
EditNote(repoStore, metadataSource, snapshotStore)

Router(authVerifier, login, addRepo, getRepos, editNote)
```

Cross-cutting concerns (logging, error mapping, auth verification) are composed here — as collaborator decorators, use case wrappers, or router middleware.

### Deployment

The backend is a long-running server-side Swift process managed by the host OS (e.g. systemd on Linux). The composition root runs once at process start — the wired dependency graph lives for the lifetime of the process. The internal router maps HTTP requests to use cases via Hummingbird 2's routing layer.

The backend listens on the port specified by the `PORT` environment variable (default `8080`). It is served behind a reverse proxy (nginx or Caddy) which terminates TLS and routes requests from the public URL to the backend process. Web UI and backend are served from the same origin — no CORS headers are required.

The OpenAPI contract paths (`/repos`, `/repos/{id}/note`, `/auth/login`) are relative to the backend's base URL. The base URL is frontend configuration, not a backend concern.

**Database**: SQLite file at the path specified by `DATABASE_PATH`. Accessed via `SQLite.swift`.

**Environment variables**:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_PATH` | Yes | Absolute path to the SQLite file |
| `JWT_SECRET` | Yes | HS256 signing secret, minimum 32 bytes |
| `AUTH_USERNAME` | Yes | Login username for the single account |
| `AUTH_PASSWORD_HASH` | Yes | bcrypt hash of the account password |
| `PORT` | No | Listen port; default `8080` |
| `GITHUB_TOKEN` | No | GitHub PAT for MetadataSource; unauthenticated rate limit applies if absent |

The backend refuses to start if any required variable is absent or malformed.

### Database Schema

`repos` table:
- `id` — UUID, primary key
- `repo_url` — TEXT, UNIQUE NOT NULL (normalized)
- `note` — TEXT, NOT NULL, DEFAULT ''
- `added_at` — TEXT, NOT NULL (ISO 8601, set server-side at insert time)

`snapshot` table (singleton row):
- `id` — INTEGER, primary key (always 1)
- `data` — TEXT (JSON blob)
- `schema_version` — INTEGER (internal to SQLiteSnapshotStore; not exposed in API response)
- `updated_at` — TEXT (ISO 8601)

**GitHub metadata**: `MetadataSource` calls `GET /repos/{owner}/{repo}` on the GitHub REST API. If `GITHUB_TOKEN` is set, requests are authenticated (`Authorization: Bearer {token}`); otherwise unauthenticated (60 req/hour). The token is read at construction by the concrete `GitHubMetadataSource`; the `MetadataSource` protocol has no knowledge of it.

CI/CD: merge to trunk → CI runs tests → artifact built → deployed to self-hosted VPS. Pipeline specifics are implementation detail.

## Key Principles

- **Client owns interfaces.** The frontend's OpenAPI schema defines the inbound contract. The backend defines the outbound protocols it needs from the database and GitHub.
- **Purely reactive.** No cron, no background jobs. All behavior is triggered by inbound requests.
- **User transaction separate from snapshot rebuild.** The user's write (add/edit) commits independently of GitHub. The snapshot rebuild is best-effort — failed metadata falls back to the previous snapshot or null.
- **Dependency inversion.** Use cases depend on protocols, not implementations. RepoStore, SnapshotStore, MetadataSource are protocols — concrete implementations are wired at the composition root.
- **Pure functions for domain logic.** Snapshot assembly and URL normalization are pure, stateless, dependency-free. Tested independently.
- **Single responsibility.** Use cases orchestrate. Stores persist. MetadataSource reads external data. Routing maps HTTP to use cases. Each has one reason to change.
- **Composition over configuration.** All wiring happens at the composition root. No service locators, no singletons, no ambient state.