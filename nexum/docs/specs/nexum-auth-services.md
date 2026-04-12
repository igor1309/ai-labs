---
date: 2026-04-12
model: claude-opus-4-6
description: "Spec: Auth services — LoginService request/response mapping over HTTPClient"
---

# Spec: Nexum Auth Services (v1)

## Goal

LoginService implements the auth effect handler's collaborator protocol (`Authenticator`) by mapping the protocol call to `POST /auth/login` via an injected `HTTPClient`; defined in `nexum-frontend-auth-adr-v0_1_0.md` against the contract in `nexum-openapi-v1.yml`.

## Public interface

### HTTPClient protocol

Defined in the Repo Services spec and shared by all service types. LoginService depends on the same `HTTPClient` protocol.

### Service type

```swift
struct LoginService: Authenticator {
    init(httpClient: HTTPClient)
    func authenticate(username: String, password: String) async -> AuthenticateResult
}
```

(`AuthenticateResult`, `AuthError`, and `Token` are defined in the Auth State Machine spec.)

### API response shapes (decoded internally, not leaked)

```
AuthResponse  { token: String, expiresAt: Date }
Error         { error: true, code: String, message: String }
```

`AuthResponse` corresponds to the `AuthResponse` schema in `nexum-openapi-v1.yml`. `token` maps to `Token.value`; `expiresAt` maps to `Token.expiresAt`.

## Behavior rules

### LoginService

1. Sends `POST /auth/login` with `Content-Type: application/json` body `{ "username": username, "password": password }`.
2. `200` + valid `AuthResponse` JSON → returns `.success(Token(value: token, expiresAt: expiresAt))`.
3. `200` + invalid or unparseable JSON → returns `.failure(.serverError("unexpected response"))`.
4. `401` → returns `.failure(.invalidCredentials)`.
5. Any other `4xx` or `5xx` → returns `.failure(.serverError(message))` where `message` is decoded from the OpenAPI `Error` schema envelope (`{ error, code, message }`) if present, otherwise empty.
6. `HTTPClientError` (network or invalid response) → returns `.failure(.network)`.

### Shared

7. LoginService does not hold state between calls.
8. LoginService does not know about token caching, persistence, or the token cache. It returns the token; the caller (auth effect handler) handles caching.
9. LoginService uses the bare `HTTPClient`, not the decorated chain (`SigningAdapter`, `AuthInterceptor`). This is a composition root concern — the login call happens in phase 1, before the decorated chain exists.
10. LoginService decodes responses using the shapes defined in the OpenAPI contract; unknown fields are ignored.

## Tests (required)

Using an `HTTPClient` spy/fake that returns configured `HTTPResult` values:

### LoginService

1. `200` with valid `AuthResponse` JSON → `.success(Token(...))` with correct `value` and `expiresAt`.
2. `200` with malformed JSON → `.failure(.serverError(...))`.
3. `401` → `.failure(.invalidCredentials)`.
4. `500` with error envelope → `.failure(.serverError(...))`.
5. `HTTPClientError.network` → `.failure(.network)`.
6. Request sent is `POST /auth/login` with JSON body containing `username` and `password`.

## Done criteria

- LoginService conforms to `Authenticator` protocol from the Auth State Machine spec.
- LoginService depends on `HTTPClient` as defined in the Repo Services spec.
- LoginService does not import or reference token cache, signing adapter, or persistence types.
- All listed tests pass.
