---
date: 2026-04-12
model: claude-sonnet-4-6
description: "Spec: Nexum backend — HTTP server, protocols, pure functions, and use cases"
---

# Spec: Nexum Backend (v1)

## Goal

Server-side Swift process that exposes four REST endpoints defined by `nexum-openapi-v1.yml`. Owned by the nexum project. Architecture established by `nexum-backend-adr-v0_3_0.md`.

## Public interface

### Protocols

#### RepoStore

```swift
func add(url: String, note: String, addedAt: Date) async -> Result<RepoEntry, AddRepoError>
func findById(_ id: UUID) async -> RepoEntry?
func findByUrl(_ url: String) async -> RepoEntry?
func updateNote(id: UUID, note: String) async -> Result<Void, NotFoundError>
func list() async -> [RepoEntry]
```

`RepoEntry`: `{ id: UUID, repoUrl: String, note: String, addedAt: Date }`.

`AddRepoError`: `.duplicate(existingId: UUID)`.

#### SnapshotStore

```swift
func read() async -> SnapshotBlob?
func write(_ blob: SnapshotBlob) async
```

`SnapshotBlob` is the JSON-serializable form of the `SnapshotResponse` schema.

#### MetadataSource

```swift
func fetch(url: String) async -> Result<RepoMetadata, Error>
```

`RepoMetadata`: `{ name: String, stars: Int, description: String? }`.

#### CredentialVerifier

```swift
func verify(username: String, password: String) -> Bool
```

#### TokenIssuer

```swift
func issue(username: String) -> TokenResult
```

`TokenResult`: `{ token: String, expiresAt: Date }`.

### Pure Functions

#### normalizeUrl

```swift
func normalizeUrl(_ input: String) -> Result<String, URLValidationError>
```

#### SnapshotBuilder

```swift
func buildSnapshot(
    entries: [RepoEntry],
    metadataResults: [UUID: Result<RepoMetadata, Error>],
    previousSnapshot: SnapshotBlob?
) -> SnapshotBlob
```

### HTTP Endpoints

Per `nexum-openapi-v1.yml`:

| Method | Path | Auth |
|--------|------|------|
| `POST` | `/auth/login` | None |
| `POST` | `/repos` | Bearer |
| `GET` | `/repos` | Bearer |
| `PATCH` | `/repos/{id}/note` | Bearer |

All responses use `Content-Type: application/json`.

## Behavior rules

### normalizeUrl

1. Accepts GitHub repo URLs: scheme `https`, host `github.com`, exactly two non-empty path segments (`{owner}/{repo}`).
2. Normalizes: lowercase scheme and host; strip trailing slash; strip `.git` suffix from the final path segment.
3. Rejects if a query string or URL fragment is present after parsing.
4. Rejects URLs with fewer or more than two non-empty path segments after normalization.
5. Rejects non-GitHub hosts.
6. Returns the normalized URL string on success; `URLValidationError` on any failure.

### SnapshotBuilder

7. Every entry in `entries` appears exactly once in the output snapshot.
8. Entry order in the output is by `addedAt` ascending.
9. Entry with a successful metadata result → `name`, `stars`, and `description` from that result.
10. Entry with a failed metadata result, and that entry's `id` has metadata in `previousSnapshot` → preserve previous `name`, `stars`, and `description`.
11. Entry with a failed metadata result, and no previous metadata exists for that entry → `name`, `stars`, and `description` are `null`.
12. `SnapshotBuilder` has no external dependencies and takes no async arguments. It is a pure function.

### CredentialVerifier

13. Returns `true` only when `username` matches the configured account username AND `password` matches the configured password hash via bcrypt comparison.
14. Returns `false` on any mismatch, including a correct username with a wrong password, or vice versa.
15. Returns `false` for empty username or empty password.

### TokenIssuer

16. Issues a signed JWT (HS256) using the configured secret.
17. Token expiry is exactly 24 hours from issuance time.
18. Token payload includes the username identity claim.

### Login use case

19. Verifies credentials via `CredentialVerifier`. On rejection → `401` with `code: "unauthorized"`.
20. On success → `200` with `{ token, expiresAt }`.
21. `POST /auth/login` is never guarded by bearer auth — no `Authorization` header is read or required on this route.

### AddRepo use case

22. Applies `normalizeUrl` to the input URL. On failure → `400` with `code: "invalid_input"`.
23. Calls `RepoStore.add` with the normalized URL, the provided note, and a server-assigned `addedAt` (UTC). On `.duplicate` → `409` with `code: "duplicate"` and `existingId`.
24. On successful persist: reads the previous snapshot from `SnapshotStore`, lists all entries from `RepoStore`, fetches metadata for each entry via `MetadataSource` (best-effort), builds a new snapshot via `SnapshotBuilder`, writes it to `SnapshotStore`, and returns `201` with the snapshot.
25. The user transaction (persisting the entry) completes before snapshot rebuild begins. A snapshot rebuild failure does not roll back the persisted entry.
26. `addedAt` is assigned server-side at insert time. Any client-supplied timestamp is ignored.
27. Missing or invalid bearer token → `401` with `code: "unauthorized"`.

### GetRepos use case

28. Reads and returns the current snapshot from `SnapshotStore`. No writes or side effects.
29. If `SnapshotStore` contains no data → `200` with `{ repos: [] }`.
30. Missing or invalid bearer token → `401` with `code: "unauthorized"`.

### EditNote use case

31. Looks up the entry by `id` via `RepoStore.findById`. Not found → `404` with `code: "not_found"`.
32. Calls `RepoStore.updateNote`. On success: rebuilds and writes snapshot (same best-effort rules as AddRepo, rules 24–25), and returns `200` with the snapshot.
33. Empty string is a valid note value.
34. Missing or invalid bearer token → `401` with `code: "unauthorized"`.

### Router and auth verification

35. All routes except `POST /auth/login` require a valid, non-expired `Authorization: Bearer <token>` header.
36. Token validity: correct HS256 signature using the configured secret, and `exp` claim not in the past.
37. Missing header, malformed header, invalid signature, or expired token → `401` with `code: "unauthorized"`.
38. `POST /auth/login` is dispatched directly to the Login use case without any bearer-token check.

### Error envelope

39. All error responses use `{ error: true, code: string, message: string }`.
40. `409` duplicate responses include `existingId: UUID` in addition to the standard error fields.

### Startup

41. The process refuses to start if any required environment variable is absent or empty: `DATABASE_PATH`, `JWT_SECRET`, `AUTH_USERNAME`, `AUTH_PASSWORD_HASH`.
42. `PORT` is optional; defaults to `8080` when absent.
43. `GITHUB_TOKEN` is optional; when absent, `MetadataSource` uses unauthenticated GitHub API requests.

## Tests (required)

### normalizeUrl

- Valid `https://github.com/owner/repo` → returns the same normalized string.
- Trailing slash stripped: `https://github.com/owner/repo/` → `https://github.com/owner/repo`.
- `.git` suffix stripped: `https://github.com/owner/repo.git` → `https://github.com/owner/repo`.
- Both trailing slash and `.git` stripped together.
- Uppercase scheme and host lowercased: `HTTPS://GITHUB.COM/owner/repo` → `https://github.com/owner/repo`.
- URL with query string → error.
- URL with fragment → error.
- One path segment only (`https://github.com/owner`) → error.
- Three or more path segments → error.
- Empty path segments (e.g. `https://github.com//repo`) → error.
- Non-GitHub host → error.
- Empty string input → error.

### SnapshotBuilder

- All entries appear in the output, ordered by `addedAt` ascending.
- Entry with successful metadata → fresh `name`, `stars`, `description` in snapshot.
- Entry with failed metadata, present in previous snapshot → previous metadata preserved.
- Entry with failed metadata, absent from previous snapshot → `name`, `stars`, `description` are `null`.
- Empty `entries` list → `{ repos: [] }`.
- `previousSnapshot` is `nil` and metadata fetch fails → `null` metadata fields (no crash).

### CredentialVerifier

- Correct username and correct password → `true`.
- Correct username, wrong password → `false`.
- Wrong username, correct password → `false`.
- Empty username → `false`.
- Empty password → `false`.

### TokenIssuer

- Issued token decodes to correct HS256 JWT with the expected identity claim.
- `expiresAt` is approximately 24 hours from issuance (within 1 second tolerance).

### Login use case

- Valid credentials → `200` with `token` (non-empty string) and `expiresAt`.
- Invalid credentials → `401` with `code: "unauthorized"`.
- Request with no `Authorization` header succeeds (login is not auth-guarded).

### AddRepo use case

- Valid URL, new entry, metadata fetch succeeds → `201`, snapshot contains entry with fresh metadata.
- Valid URL, new entry, metadata fetch fails, no previous snapshot → `201`, snapshot entry has `null` metadata fields.
- Valid URL, new entry, metadata fetch fails, previous snapshot exists for that URL → `201`, snapshot entry has previous metadata.
- Duplicate normalized URL → `409` with `code: "duplicate"` and correct `existingId`.
- Malformed URL → `400` with `code: "invalid_input"`.
- Missing bearer token → `401`.
- `addedAt` in response matches server-assigned timestamp, not any client value.

### GetRepos use case

- Snapshot exists in store → `200` with that snapshot.
- Snapshot store is empty → `200` with `{ repos: [] }`.
- Missing bearer token → `401`.

### EditNote use case

- Existing entry, valid note → `200`, snapshot reflects updated note.
- Empty string note → `200` (valid).
- Non-existent ID → `404` with `code: "not_found"`.
- Missing bearer token → `401`.

### Router / auth verification

- Valid non-expired token on guarded endpoint → request proceeds.
- Expired token on guarded endpoint → `401`.
- Missing `Authorization` header on guarded endpoint → `401`.
- Malformed `Authorization` header (no `Bearer` prefix, truncated token) → `401`.
- `POST /auth/login` with no `Authorization` header → not rejected by auth layer.

### Startup

- All required env vars present → process starts and responds on `PORT`.
- Any single required var missing → process exits before accepting connections.
- `PORT` absent → process listens on `8080`.

## Done criteria

- All five protocols (`RepoStore`, `SnapshotStore`, `MetadataSource`, `CredentialVerifier`, `TokenIssuer`) are defined in the nexum backend module and owned by that module.
- `normalizeUrl` and `SnapshotBuilder` are pure functions with no external dependencies and no async surface.
- All four use cases (`Login`, `AddRepo`, `GetRepos`, `EditNote`) are implemented and pass their listed tests.
- HTTP response shapes match `nexum-openapi-v1.yml` for all four endpoints.
- All listed tests pass.
- Process startup fails fast on any missing required environment variable.
