---
date: 2026-04-13
model: claude-opus-4-6
description: "Implementation plan: Nexum backend — HTTP server, protocols, pure functions, use cases, and composition root"
---

# Nexum Backend Implementation Plan

Implements `nexum-backend-spec-v1.md`. Architecture established by `nexum-backend-adr-v0_3_0.md`, amended by `nexum-backend-auth-adr-v0_1_0.md`. Stack locked by `nexum-stack-adr-v0_1_0.md`.

## Goal

Deliver a working server-side Swift backend that exposes the four REST endpoints defined by `nexum-openapi-v1.yml`, backed by SQLite persistence, JWT auth, and best-effort GitHub metadata — all passing the tests enumerated in the spec.

## Execution lock

Worktree required: yes
Expected worktree: worktrees/nexum-backend
Expected branch: codex/nexum-backend
Preflight check: [ ] done

## Scope guardrails

- Backend only — no frontend core, CLI, or web UI work.
- No CI/CD pipeline setup (deployment is deferred).
- No load balancer or rate limiter (backlog item, out of scope).
- No multi-user authorization logic (single-user enforcement is a deployment concern per auth ADR).
- No CORS headers (same-origin deployment per backend ADR).
- Docker/container setup is deferred.
- The `MetadataSource` concrete implementation calls GitHub REST API but does not implement retry or circuit-breaker logic — best-effort only.

## ADR traceability matrix

| ADR invariant | Phase |
|---|---|
| Full Swift stack, Hummingbird 2 | Phase 1 |
| Client owns interfaces — protocols defined by backend | Phase 2 |
| Dependency inversion — use cases depend on protocols | Phase 3 |
| Pure functions for domain logic (normalizeUrl, SnapshotBuilder) | Phase 2 |
| User transaction separate from snapshot rebuild | Phase 3 |
| Auth is explicit router dependency, not middleware | Phase 5 |
| Provider-agnostic auth contract, async by contract | Phase 2, 4 |
| Composition over configuration — all wiring at composition root | Phase 6 |
| Startup fail-fast on missing env vars | Phase 6 |
| DB unique constraint for duplicate detection (impl note) | Phase 4 |

## Phase 1 — Swift package scaffold and domain models

**Objective**: Establish the Swift package with dependencies and define all domain model types so subsequent phases have a compilable foundation.

**Key work items**:
- Create `Package.swift` with targets: `NexumBackend` (library), `NexumServer` (executable), `NexumBackendTests` (test).
- Add dependencies: `hummingbird` (~> 2.0), `sqlite` (SQLite.swift), `swift-jwt` or `jwt-kit`, `swift-bcrypt` or `bcrypt` (evaluate available Swift packages).
- Define domain model types in `Sources/NexumBackend/Models/`:
  - `RepoEntry` (store model): `id: UUID`, `repoUrl: String`, `note: String`, `addedAt: Date`.
  - `RepoMetadata`: `name: String`, `stars: Int`, `description: String?`.
  - `SnapshotBlob` / `SnapshotResponse`: the JSON-serializable snapshot with `repos` array.
  - `SnapshotRepoEntry` (API model): `id`, `repoUrl`, `name?`, `stars?`, `description?`, `note`, `addedAt`.
  - `Identity`: `sub: String`.
  - `TokenResult`: `token: String`, `expiresAt: Date`.
  - `AuthResponse`: matches OpenAPI `AuthResponse` schema.
  - Error types: `AddRepoError`, `NotFoundError`, `URLValidationError`, `AuthError`.
  - Error envelope: `ErrorResponse` matching OpenAPI `Error` and `DuplicateError` schemas.
- Verify the package compiles: `swift build`.

**Dependencies**: None (first phase).

**Risks**: Swift package ecosystem availability — Hummingbird 2, JWT, bcrypt, and SQLite libraries must be compatible with the Swift version. Mitigated by verifying dependency resolution early.

**Validation**: `swift build` succeeds. Model types are defined with correct shapes matching the OpenAPI contract.

**Completion signal**: Package compiles with all model types defined. No tests yet — models are data types.

## Phase 2 — Pure functions and protocols

**Objective**: Implement the two pure functions (`normalizeUrl`, `SnapshotBuilder`) with full test coverage, and define all six protocol interfaces.

**Key work items**:
- Implement `normalizeUrl` in `Sources/NexumBackend/Domain/NormalizeUrl.swift`:
  - Accepts GitHub repo URLs (`https://github.com/{owner}/{repo}`).
  - Normalizes: lowercase scheme+host, strip trailing slash, strip `.git`.
  - Rejects: query string, fragment, wrong segment count, non-GitHub host, non-https scheme, empty input.
  - Returns `Result<String, URLValidationError>`.
- Implement `SnapshotBuilder` in `Sources/NexumBackend/Domain/SnapshotBuilder.swift`:
  - Pure function: entries + metadata results + previous snapshot → new snapshot.
  - Orders entries by `addedAt` ascending.
  - Applies metadata fallback cascade: fresh → previous → null.
- Define protocols in `Sources/NexumBackend/Protocols/`:
  - `RepoStore` (5 methods per spec).
  - `SnapshotStore` (`read`, `write`).
  - `MetadataSource` (`fetch`).
  - `CredentialVerifier` (`verify`).
  - `TokenIssuer` (`issue`).
  - `AuthVerifier` (`verify`).
- Write all spec-listed tests for `normalizeUrl` (12 test cases).
- Write all spec-listed tests for `SnapshotBuilder` (6 test cases).

**Dependencies**: Phase 1 (model types).

**Risks**: Swift `URL`/`URLComponents` parsing edge cases (empty segments, trailing slashes). Mitigated by the extensive test list in the spec.

**Validation**: All 18 pure function tests pass. Protocols compile. Full test suite green.

**Completion signal**: `normalizeUrl` and `SnapshotBuilder` fully tested. All six protocols defined and compiling.

## Phase 3 — Use cases with in-memory fakes

**Objective**: Implement all four use cases (`Login`, `AddRepo`, `GetRepos`, `EditNote`) and validate orchestration logic against in-memory test doubles.

**Key work items**:
- Create in-memory test fakes:
  - `InMemoryRepoStore` conforming to `RepoStore`.
  - `InMemorySnapshotStore` conforming to `SnapshotStore`.
  - `StubMetadataSource` conforming to `MetadataSource` (configurable success/failure per URL).
  - `StubCredentialVerifier` conforming to `CredentialVerifier`.
  - `StubTokenIssuer` conforming to `TokenIssuer`.
- Implement use cases in `Sources/NexumBackend/UseCases/`:
  - `LoginUseCase(credentialVerifier, tokenIssuer)` — verify credentials, issue token.
  - `AddRepoUseCase(repoStore, metadataSource, snapshotStore)` — normalize URL, add entry, rebuild snapshot.
  - `GetReposUseCase(snapshotStore)` — read and return snapshot.
  - `EditNoteUseCase(repoStore, metadataSource, snapshotStore)` — find entry, update note, rebuild snapshot.
- Snapshot rebuild logic shared between `AddRepo` and `EditNote`: extract to a helper or inline — keep it minimal.
- Ensure user transaction commits before snapshot rebuild (rules 25, 42).
- Write all spec-listed tests:
  - Login: 3 tests (valid creds, invalid creds, no auth header required).
  - AddRepo: 7 tests (success+metadata, success+fail metadata no prev, success+fail metadata with prev, duplicate, malformed URL, missing token, server-assigned addedAt).
  - GetRepos: 3 tests (snapshot exists, empty store, missing token).
  - EditNote: 4 tests (success, empty note, not found, missing token).

**Dependencies**: Phase 2 (protocols, pure functions).

**Risks**: Snapshot rebuild orchestration complexity — multiple async calls with fallback logic. Mitigated by testing each metadata fallback path independently.

**Validation**: All 17 use case tests pass. Full test suite green (35 tests total: 18 pure + 17 use case).

**Completion signal**: All four use cases implemented and tested against fakes. Core business logic is validated.

## Phase 4 — Concrete implementations: auth and persistence

**Objective**: Implement the concrete `CredentialVerifier`, `TokenIssuer`, `AuthVerifier` (auth), and `SQLiteRepoStore`, `SQLiteSnapshotStore` (persistence).

**Key work items**:
- Auth implementations in `Sources/NexumBackend/Adapters/Auth/`:
  - `BcryptCredentialVerifier`: reads configured username + password hash, bcrypt comparison.
  - `JWTTokenIssuer`: HS256 signing with configured secret, 24h expiry, username claim.
  - `JWTAuthVerifier`: HS256 signature verification + expiry check, returns `Identity` or throws `AuthError.invalidToken`.
- Persistence implementations in `Sources/NexumBackend/Adapters/Persistence/`:
  - `SQLiteRepoStore`: `repos` table with `UNIQUE` constraint on `repo_url` for duplicate detection (per implementation note).
  - `SQLiteSnapshotStore`: `snapshot` table (singleton row pattern).
  - Database schema creation (migrations or `CREATE TABLE IF NOT EXISTS`).
- Write spec-listed tests:
  - CredentialVerifier: 5 tests.
  - TokenIssuer: 2 tests.
  - AuthVerifier: 4 tests.
  - SQLite stores: test RepoStore CRUD + duplicate, SnapshotStore read/write + empty read. Use in-memory SQLite for test isolation.

**Dependencies**: Phase 2 (protocols), Phase 1 (models).

**Risks**:
- bcrypt library availability/API in Swift. Evaluate `swift-bcrypt` or `Bcrypt` from Vapor. Mitigated by checking the library API before writing code (per CLAUDE.md dependency API rule).
- JWT library API differences across versions. Same mitigation.
- SQLite schema correctness — unique constraint enforcement. Mitigated by explicit duplicate-insert test.

**Validation**: All auth tests (11) and persistence tests pass. Full test suite green.

**Completion signal**: All concrete auth and persistence adapters implemented and tested.

## Phase 5 — Router and HTTP layer

**Objective**: Implement the Hummingbird 2 router that maps HTTP requests to use cases, applies auth verification, and serializes responses including the error envelope.

**Key work items**:
- Implement router in `Sources/NexumBackend/Router/`:
  - `POST /auth/login` → `LoginUseCase` (no auth check, rule 38).
  - `POST /repos` → `AddRepoUseCase` (auth required).
  - `GET /repos` → `GetReposUseCase` (auth required).
  - `PATCH /repos/{id}/note` → `EditNoteUseCase` (auth required).
- Auth verification as explicit router dependency (per auth ADR — not middleware magic):
  - Extract `Authorization: Bearer <token>` header.
  - Call `AuthVerifier.verify(token)`.
  - On failure → `401` with error envelope.
- Request parsing: JSON decode request bodies, extract path parameters.
- Response serialization: JSON encode responses matching OpenAPI schemas.
- Error envelope (rule 39-40): `{ error: true, code, message }` for all errors; `DuplicateError` adds `existingId`.
- Infrastructure error catch-all (rules 41-42): unhandled errors → `500` with `code: "internal_error"`.
- Write spec-listed router/auth tests:
  - 5 router/auth verification tests (valid token, expired, missing header, malformed header, login bypasses auth).
- Write HTTP-level integration tests for each endpoint using Hummingbird's test utilities (in-process HTTP testing if available, or actual HTTP requests against a test server).

**Dependencies**: Phase 3 (use cases), Phase 4 (auth verifier concrete implementation for integration tests; in-memory fakes for unit tests).

**Risks**: Hummingbird 2 API surface — routing, middleware, request/response types. Mitigated by reading Hummingbird 2 documentation and examples before implementation.

**Validation**: All router/auth tests pass. HTTP integration tests confirm correct status codes, response shapes, and error envelopes for all four endpoints. Full test suite green.

**Completion signal**: All four HTTP endpoints respond correctly. Auth verification works. Error envelope is uniform.

## Phase 6 — Composition root and startup

**Objective**: Wire all concrete implementations at the app entry point, validate environment variables at startup, and run end-to-end validation.

**Key work items**:
- Implement composition root in `Sources/NexumServer/`:
  - Read and validate environment variables: `DATABASE_PATH`, `JWT_SECRET`, `AUTH_USERNAME`, `AUTH_PASSWORD_HASH` (required); `PORT` (optional, default 8080); `GITHUB_TOKEN` (optional).
  - Fail fast (exit before accepting connections) if any required var is missing or empty (rules 43-44).
  - Instantiate concrete implementations: `SQLiteRepoStore`, `SQLiteSnapshotStore`, `GitHubMetadataSource`, `BcryptCredentialVerifier`, `JWTTokenIssuer`, `JWTAuthVerifier`.
  - Wire use cases: `LoginUseCase`, `AddRepoUseCase`, `GetReposUseCase`, `EditNoteUseCase`.
  - Wire router with `authVerifier` + all use cases.
  - Start Hummingbird server on configured port.
- Implement `GitHubMetadataSource` in `Sources/NexumBackend/Adapters/External/`:
  - `GET /repos/{owner}/{repo}` on GitHub REST API.
  - Authenticated if `GITHUB_TOKEN` is set, unauthenticated otherwise.
  - Returns `RepoMetadata` on success, throws on failure.
- Write spec-listed tests:
  - Startup: 3 tests (all vars present → starts, missing required var → exits, PORT absent → 8080).
  - MetadataSource: test with mock HTTP client (success → metadata, failure → throws).
- Run full test suite as final gate.

**Dependencies**: All previous phases (1–5).

**Risks**: Environment variable handling edge cases (empty string vs absent). Mitigated by explicit tests. GitHub API response shape changes — mitigated by testing against recorded/mocked responses.

**Validation**: Startup tests pass. MetadataSource tests pass. Full test suite green. `swift build` succeeds.

**Completion signal**: The server binary starts, validates env vars, and serves all four endpoints with real SQLite persistence and JWT auth.

## Done criteria

- All six protocols (`RepoStore`, `SnapshotStore`, `MetadataSource`, `CredentialVerifier`, `TokenIssuer`, `AuthVerifier`) are defined in the nexum backend module.
- `normalizeUrl` and `SnapshotBuilder` are pure functions with no external dependencies and no async surface.
- All four use cases (`Login`, `AddRepo`, `GetRepos`, `EditNote`) are implemented and pass their listed tests.
- HTTP response shapes match `nexum-openapi-v1.yml` for all four endpoints.
- All tests enumerated in the spec pass.
- Process startup fails fast on any missing required environment variable.
- `swift build` succeeds.
- Full test suite green.
