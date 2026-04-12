---
date: 2026-04-12
model: claude-sonnet-4-6
description: "Spec: Repo services — AddRepoService, GetReposService, EditNoteService request/response mapping over HTTPClient"
---

# Spec: Nexum Repo Services (v1)

## Goal

Three services implement the effect handler's collaborator protocols (`AddRepo`, `GetRepos`, `EditNote`) by mapping each protocol call to the corresponding REST endpoint via an injected `HTTPClient`; defined in `nexum-frontend-adr-v0_2_0.md` against the contract in `nexum-openapi-v1.yml`.

## Public interface

### HTTPClient protocol (owned by services, shared with auth services)

```swift
protocol HTTPClient {
    func send(_ request: HTTPRequest) async -> HTTPResult
}

struct HTTPRequest {
    var method: HTTPMethod
    var path: String
    var body: Data?
    var headers: [String: String]
}

enum HTTPMethod { case get, post, patch }

enum HTTPResult {
    case success(statusCode: Int, data: Data)
    case failure(HTTPClientError)
}

enum HTTPClientError {
    case network(Error)
    case invalidResponse
}
```

### AppError

`AppError` is defined in the App State Machine spec and owned by that module. Services use it via the collaborator result types (`AddRepoResult`, `GetReposResult`, `EditNoteResult`).

### Service types

```swift
struct GetReposService: GetRepos {
    init(httpClient: HTTPClient)
    func getRepos() async -> GetReposResult
}

struct AddRepoService: AddRepo {
    init(httpClient: HTTPClient)
    func addRepo(url: String, note: String) async -> AddRepoResult
}

struct EditNoteService: EditNote {
    init(httpClient: HTTPClient)
    func editNote(id: UUID, note: String) async -> EditNoteResult
}
```

(`GetReposResult`, `AddRepoResult`, `EditNoteResult` are defined in the App State Machine spec.)

### API response shapes (decoded internally, not leaked)

```
SnapshotResponse { repos: [RepoEntry] }
DuplicateError   { error: true, code: "duplicate", existingId: UUID }
Error            { error: true, code: String, message: String }
```

`RepoEntry` fields from OpenAPI: `id: UUID`, `repoUrl: String`, `name: String?`, `stars: Int?`, `description: String?`, `note: String`, `addedAt: Date`.

## Behavior rules

### GetReposService

1. Sends `GET /repos`; no request body; no query parameters.
2. `200` + valid `SnapshotResponse` JSON → returns `.success(repos)`.
3. `200` + invalid or unparseable JSON → returns `.failure(.unexpectedResponse)`.
4. `401` → returns `.failure(.unauthorized)`.
5. Any other `4xx` or `5xx` → returns `.failure(.serverError(message))` where `message` is decoded from the OpenAPI `Error` schema envelope (`{ error, code, message }`) if present, otherwise empty.
6. `HTTPClientError` (network or invalid response) → returns `.failure(.network)`.

### AddRepoService

7. Sends `POST /repos` with `Content-Type: application/json` body `{ "repoUrl": url, "note": note }`.
8. `201` + valid `SnapshotResponse` JSON → returns `.success(repos)`.
9. `409` + valid `DuplicateError` JSON → returns `.duplicate(existingId: id)`.
10. `409` + invalid JSON → returns `.failure(.unexpectedResponse)`.
11. `400` → returns `.failure(.invalidInput)`.
12. `401` → returns `.failure(.unauthorized)`.
13. `201` + invalid JSON → returns `.failure(.unexpectedResponse)`.
14. Any other `4xx` or `5xx` → returns `.failure(.serverError(message))`.
15. `HTTPClientError` → returns `.failure(.network)`.

### EditNoteService

16. Sends `PATCH /repos/{id}/note` with `Content-Type: application/json` body `{ "note": note }`; `id` is formatted as a lowercase UUID string in the path.
17. `200` + valid `SnapshotResponse` JSON → returns `.success(repos)`.
18. `200` + invalid JSON → returns `.failure(.unexpectedResponse)`.
19. `404` → returns `.failure(.notFound)`.
20. `401` → returns `.failure(.unauthorized)`.
21. Any other `4xx` or `5xx` → returns `.failure(.serverError(message))`.
22. `HTTPClientError` → returns `.failure(.network)`.

### Shared

23. Services do not hold state between calls.
24. Services do not know about auth tokens, signing, or request decorators.
25. Services decode responses using the shapes defined in the OpenAPI contract; unknown fields are ignored.

## Tests (required)

Using an `HTTPClient` spy/fake that returns configured `HTTPResult` values:

### GetReposService

1. `200` with valid snapshot JSON → `.success` with decoded `[RepoEntry]`.
2. `200` with malformed JSON → `.failure(.unexpectedResponse)`.
3. `401` → `.failure(.unauthorized)`.
4. `500` with error envelope → `.failure(.serverError(...))`.
5. `HTTPClientError.network` → `.failure(.network)`.
6. Request sent is `GET /repos` with no body.

### AddRepoService

7. `201` with valid snapshot JSON → `.success` with decoded `[RepoEntry]`.
8. `409` with valid `DuplicateError` JSON (contains `existingId`) → `.duplicate(existingId: id)`.
9. `409` with malformed JSON → `.failure(.unexpectedResponse)`.
10. `400` → `.failure(.invalidInput)`.
11. `401` → `.failure(.unauthorized)`.
12. `201` with malformed JSON → `.failure(.unexpectedResponse)`.
13. `HTTPClientError.network` → `.failure(.network)`.
14. Request sent is `POST /repos` with JSON body containing `repoUrl` and `note`.

### EditNoteService

15. `200` with valid snapshot JSON → `.success` with decoded `[RepoEntry]`.
16. `200` with malformed JSON → `.failure(.unexpectedResponse)`.
17. `404` → `.failure(.notFound)`.
18. `401` → `.failure(.unauthorized)`.
19. `HTTPClientError.network` → `.failure(.network)`.
20. Request path contains the UUID string of the given `id`; body contains `note`.

## Done criteria

- Each service conforms to its collaborator protocol from the App State Machine spec.
- `HTTPClient` protocol lives in the same module as the services.
- Services do not import or reference auth types.
- All listed tests pass.
