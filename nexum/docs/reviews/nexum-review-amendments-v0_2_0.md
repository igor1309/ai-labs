---
title: "ADR: Nexum Architecture Review Amendments v0.2.0"
date: 2026-04-05
model: claude-sonnet-4-6
version: 0.2.0
status: applied
type: adr
amends:
  - nexum-backend-adr-v0_3_0.md
  - nexum-frontend-adr-v0_2_0.md
  - nexum-frontend-auth-adr-v0_1_0.md
  - nexum-backend-auth-adr-v0_1_0.md
  - nexum-stack-adr-v0_1_0.md
references:
  - implementation-readiness-review-v0_2_0.md
  - nexum-review-amendments-v0_1_0.md
closes-review-findings:
  - 1.1: web UI rendering layer
  - 1.3: database engine
  - 2.1: auth provider and method
  - 2.2: JWT verification specifics
  - 2.3: Rejection shape
  - 2.4: SessionResolver validation depth
  - 2.5: token persistent storage
  - 3.1: database schema
  - 3.2: snapshot schemaVersion
  - 3.3: addedAt ownership
  - 4.1: URL validation rule
  - 7.1: CORS
  - 7.2: environment configuration
  - 7.3: GitHub API auth for MetadataSource
  - 9.3: backend ADR deployment section contradicted
  - 9.4: "Combine (current RxViewModel)" reference
---

# ADR: Nexum Architecture Review Amendments v0.2.0

## Context

`implementation-readiness-review-v0_2_0.md` identified one blocker, several gaps, and ambiguities remaining after the stack ADR. This document closes all of them. It supersedes no prior ADR — it only amends specific sections of existing documents.

---

## 1. Web UI rendering layer (finding 1.1)

### Decision

The web UI rendering layer is **JavaScriptKit** with a thin JavaScript shim for browser API access. ElementaryUI is not chosen — it is an additional dependency that imposes its own view model conventions on top of the state machine architecture already defined. JavaScriptKit provides direct DOM/event access with no imposed structure, keeping the rendering layer subordinate to the Swift state machine.

### Amended document

`nexum-frontend-adr-v0_2_0.md` — add to "Web UI" section: rendering layer is JavaScriptKit + thin JS shim. UI layer calls state machine actions and reads state machine state for rendering; no other framework.

---

## 2. Database engine (finding 1.3)

### Decision

The database is **SQLite**, accessed via the Swift [`SQLite.swift`](https://github.com/stephencelis/SQLite.swift) library. Rationale: single-user app, self-hosted, no separate server process, straightforward migration story, native Swift library with good type safety.

PostgreSQL (PostgresNIO) is explicitly not chosen for v1. Supabase as remote database is not chosen — the backend is fully self-hosted.

### Amended document

`nexum-backend-adr-v0_3_0.md` — add database decision to Deployment section. Concrete implementations: `SQLiteRepoStore` and `SQLiteSnapshotStore`.

---

## 3. Auth provider and method (finding 2.1)

### Decision

**Auth provider**: self-hosted — the Nexum backend issues and verifies its own JWTs. No third-party auth service.

**Auth method**: single configured account. At startup, the backend reads `AUTH_USERNAME` and `AUTH_PASSWORD_HASH` (bcrypt) from environment. The login endpoint (`POST /auth/login`) accepts `{ username, password }`, verifies against the configured credentials, and issues a signed JWT on success.

**No registration endpoint.** The account is provisioned by the operator (environment variables). This is correct for a personal single-user tool.

### Login endpoint

Added to the API contract:

```
POST /auth/login
Body: { username: string, password: string }
Response 200: { token: string, expiresAt: string (ISO 8601) }
Response 401: Error { code: "unauthorized" }
```

The frontend auth state machine's `Authenticator` protocol implementation calls this endpoint.

### Amended documents

- `nexum-backend-adr-v0_3_0.md` — add `/auth/login` endpoint, `AUTH_USERNAME` and `AUTH_PASSWORD_HASH` env vars.
- `nexum-openapi-v1.yml` — add `POST /auth/login` path.
- `nexum-backend-auth-adr-v0_1_0.md` — document concrete auth provider: self-hosted, bcrypt password verification, JWT issuance.

---

## 4. JWT verification specifics (finding 2.2)

### Decision

**Algorithm**: HS256. The signing secret is read from the `JWT_SECRET` environment variable (minimum 32 bytes).

**Claims**:
- `sub`: username string
- `iat`: issued-at (Unix timestamp)
- `exp`: expiry (Unix timestamp); token lifetime is 24 hours

**Verification steps** in `AuthVerifier`:
1. Verify signature with `JWT_SECRET`
2. Verify `exp` has not passed
3. Return `Identity(sub:)` on success, `Rejection` on any failure

Algorithm and secret rotation are operator concerns — no app-level key rotation in v1.

### Amended document

`nexum-backend-auth-adr-v0_1_0.md` — add JWT specifics to AuthVerifier section.

---

## 5. Rejection shape (finding 2.3)

### Decision

`Rejection` is a **unit type** — no payload. It signals only that verification failed. The router produces the 401 error envelope from its own error-mapping logic; it does not inspect the rejection.

```swift
enum AuthResult {
    case identity(Identity)
    case rejection
}
```

### Amended document

`nexum-backend-auth-adr-v0_1_0.md` — update AuthVerifier return type definition.

---

## 6. SessionResolver validation depth (finding 2.4)

### Decision

`SessionResolver` checks **token existence in persistent storage AND local expiry**. If the stored token's `exp` claim is in the past, `SessionResolver` returns `.unauthenticated` immediately — bypassing a network round-trip that would only result in a 401. The backend remains the authority on token validity for all live requests.

This is a UX optimisation, not a security boundary. The backend always verifies the token on every request.

### Amended document

`nexum-frontend-auth-adr-v0_1_0.md` — update SessionResolver protocol description with validation depth.

---

## 7. Token persistent storage (finding 2.5)

### Decision

Two client surfaces, two strategies:

- **Web (Swift Wasm)**: token stored in `localStorage` via JavaScriptKit interop. Key: `nexum_auth_token`.
- **CLI**: token stored in the OS keychain via `Security.framework` on macOS. Fallback for other platforms: a permissions-restricted dotfile at `~/.config/nexum/token`.

The `TokenRefresher` is **not implemented in v1**. Tokens expire after 24 hours; the user re-authenticates. `RefreshDecorator` in the HTTP chain is omitted until token refresh is needed.

### Amended document

`nexum-frontend-auth-adr-v0_1_0.md` — document storage mechanism per client surface. Remove `TokenRefresher` from v1 scope.

---

## 8. Database schema (finding 3.1)

### Decision

Logical schema (engine-independent):

**`repos` table**

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID (TEXT) | PRIMARY KEY |
| `repo_url` | TEXT | NOT NULL, UNIQUE |
| `note` | TEXT | NOT NULL, DEFAULT `''` |
| `added_at` | TEXT | NOT NULL (ISO 8601) |

Uniqueness constraint on `repo_url` (normalized form) enforces the no-duplicate invariant at the database level. This is the preferred mechanism — no application-level findByUrl-then-insert check is needed.

**`snapshot` table** (singleton row)

| Column | Type | Constraints |
|---|---|---|
| `id` | INTEGER | PRIMARY KEY, CHECK (`id` = 1) |
| `data` | TEXT | NOT NULL (JSON blob) |
| `schema_version` | INTEGER | NOT NULL |
| `updated_at` | TEXT | NOT NULL (ISO 8601) |

The singleton constraint (`CHECK (id = 1)`) makes upsert semantics explicit.

SQLite-specific DDL follows from this logical schema and is an implementation detail.

### Amended document

`nexum-backend-adr-v0_3_0.md` — add logical schema section.

---

## 9. Snapshot `schemaVersion` (finding 3.2)

### Decision

`schemaVersion` is **internal to `SnapshotStore`**. It lives in the `snapshot` table row (column `schema_version`) and is used by the concrete `SQLiteSnapshotStore` implementation to detect schema migrations. It is **not included in the API response** — it is not part of `SnapshotResponse` or `RepoEntry`.

### Amended document

`nexum-backend-adr-v0_3_0.md` — note schemaVersion as internal implementation detail, not API surface.

---

## 10. `addedAt` ownership (finding 3.3)

### Decision

`addedAt` is **set by the server** at the time the entry is persisted. The client does not send or influence it. The `POST /repos` request body does not include `addedAt`; the backend assigns it as the wall-clock time of the write.

This is already implied by the OpenAPI contract (request body has only `repoUrl` and `note`). This amendment makes it explicit.

### Amended document

`nexum-backend-adr-v0_3_0.md` — add note to AddRepo use case: step 3 assigns `addedAt = now()` server-side.

---

## 11. URL validation rule (finding 4.1)

### Decision

A valid repo URL must match the pattern:

```
https://github.com/{owner}/{repo}
```

Rules:
- Scheme must be `https` (case-insensitive)
- Host must be `github.com` (case-insensitive)
- Path must have exactly two non-empty segments: owner and repo
- No query string, no fragment, no additional path segments
- Owner and repo must be non-empty strings of printable non-whitespace characters (GitHub's own naming constraints are not re-validated by Nexum)

Normalisation applied before validation:
1. Lowercase scheme and host
2. Strip trailing slash
3. Strip `.git` suffix from repo segment

A URL that passes normalisation and then fails the pattern match is rejected with `400 invalid_input`.

### Amended document

`nexum-backend-adr-v0_3_0.md` — add URL validation rule to `normalizeUrl` pure function description.

---

## 12. CORS (finding 7.1)

### Decision

**No CORS headers** are emitted by the backend in the default deployment topology. The web UI and backend are served from the same origin via a reverse proxy (e.g., nginx or Caddy). Same-origin requests do not require CORS headers.

If a deployment requires separate origins, CORS is handled at the reverse proxy layer, not in the application. The application does not include CORS middleware.

### Amended document

`nexum-backend-adr-v0_3_0.md` — add CORS decision to Deployment section.

---

## 13. Environment configuration (finding 7.2)

### Decision

Required environment variables for the backend:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_PATH` | Yes | Absolute path to the SQLite file |
| `JWT_SECRET` | Yes | HS256 signing secret, minimum 32 bytes |
| `AUTH_USERNAME` | Yes | Login username for the single account |
| `AUTH_PASSWORD_HASH` | Yes | bcrypt hash of the account password |
| `PORT` | No | Listen port; default `8080` |
| `GITHUB_TOKEN` | No | GitHub PAT for MetadataSource; unauthenticated if absent |

The backend refuses to start if any required variable is absent or malformed.

### Amended document

`nexum-backend-adr-v0_3_0.md` — add environment configuration table to Deployment section.

---

## 14. GitHub API auth for MetadataSource (finding 7.3)

### Decision

`MetadataSource` uses the **GitHub REST API** (`GET /repos/{owner}/{repo}`). If `GITHUB_TOKEN` is set, requests are authenticated with `Authorization: Bearer {token}` (60 requests/hour unauthenticated → 5,000/hour authenticated). For a single-user personal tool the unauthenticated rate limit is likely sufficient, but the token path is available for users who hit it.

The concrete `GitHubMetadataSource` reads `GITHUB_TOKEN` at construction. The protocol `MetadataSource` has no knowledge of the token.

### Amended document

`nexum-backend-adr-v0_3_0.md` — add MetadataSource auth note to Deployment section.

---

## 15. Backend ADR deployment section (finding 9.3)

### Decision

The Supabase Edge Function deployment description in `nexum-backend-adr-v0_3_0.md:130-136` is **replaced**. See the amended text below.

### Amended text (replaces lines 130–136)

```
### Deployment

The backend is a long-running server-side Swift process managed by the host OS (e.g. systemd on Linux). The composition root runs once at process start — the wired dependency graph lives for the lifetime of the process. The internal router maps HTTP requests to use cases via Hummingbird 2's routing layer.

The backend listens on the port specified by the `PORT` environment variable (default `8080`). It is served behind a reverse proxy (nginx or Caddy) which terminates TLS and routes requests from the public URL to the backend process.

The OpenAPI contract paths (`/repos`, `/repos/{id}/note`, `/auth/login`) are relative to the backend's base URL. The base URL is frontend configuration, not a backend concern.

CI/CD: merge to trunk → CI runs tests → artifact built → deployed to self-hosted VPS via SSH or equivalent. Pipeline specifics are implementation detail.
```

---

## 16. "Combine (current RxViewModel)" reference (finding 9.4)

### Decision

The phrase "Combine (current RxViewModel) → Observation" in `nexum-stack-adr-v0_1_0.md` refers to a **design pattern previously under consideration**, not to existing production code. At the time that ADR was written, a Combine-based reactive layer (modelled on an internal `RxViewModel` pattern) was the intended approach. The stack ADR replaces it with the Observation framework for WASM compatibility.

No code change. The stack ADR is amended to clarify the phrase.

### Amended document

`nexum-stack-adr-v0_1_0.md` — replace "Combine (current RxViewModel)" with "Combine (previously considered reactive layer pattern)" to remove the implication of existing code.

---

## Summary of amendments

| Finding | Area | Resolution |
|---|---|---|
| 1.1 | Web UI rendering layer | JavaScriptKit + thin JS shim |
| 1.3 | Database engine | SQLite via SQLite.swift |
| 2.1 | Auth provider + method | Self-hosted; single account via env vars; bcrypt + JWT |
| 2.2 | JWT verification | HS256, JWT_SECRET env var, 24h lifetime, sub+iat+exp claims |
| 2.3 | Rejection shape | Unit type; router produces 401 envelope |
| 2.4 | SessionResolver depth | Existence + local exp check |
| 2.5 | Token storage | Web: localStorage; CLI: OS keychain / dotfile |
| 3.1 | Database schema | Logical schema defined (repos + snapshot tables) |
| 3.2 | schemaVersion | Internal to SnapshotStore; not in API response |
| 3.3 | addedAt ownership | Set by server at write time |
| 4.1 | URL validation | `https://github.com/{owner}/{repo}` pattern, strict |
| 7.1 | CORS | Same-origin topology; no CORS headers in app |
| 7.2 | Environment config | Five required vars enumerated |
| 7.3 | GitHub API auth | Optional GITHUB_TOKEN; graceful unauthenticated fallback |
| 9.3 | Backend ADR deployment | Supabase text replaced with self-hosted Swift process |
| 9.4 | "current RxViewModel" | Clarified as pattern, not existing code |
