---
date: 2026-04-12
model: claude-sonnet-4-6
description: "Spec: HTTP client chain — SigningAdapter and AuthInterceptor as HTTPClient decorators"
---

# Spec: Nexum HTTP Client Chain (v1)

## Goal

`SigningAdapter` injects a Bearer token into every outgoing request and `AuthInterceptor` fires a session-lost callback on 401 responses; both conform to `HTTPClient` (defined in the Repo Services spec) so that services see a single `HTTPClient` with no knowledge of signing or auth interception; defined in `nexum-frontend-auth-adr-v0_1_0.md`. Both types are composition-root-level decorators and do not belong to the auth module or the services module.

## Public interface

```swift
struct SigningAdapter: HTTPClient {
    /// `tokenProvider` is the async closure `{ tokenCache.read()?.value }` wired at the composition root.
    init(client: HTTPClient, tokenProvider: @escaping () async -> String?)
    func send(_ request: HTTPRequest) async -> HTTPResult
}

struct AuthInterceptor: HTTPClient {
    /// `onSessionLost` is wired to the auth state machine's `.sessionLost` dispatch at the composition root.
    init(client: HTTPClient, onSessionLost: @escaping () -> Void)
    func send(_ request: HTTPRequest) async -> HTTPResult
}
```

Both types are composed at the composition root in this order (services receive the outermost client):

```
ConcreteHTTPClient
       ↓
SigningAdapter(client: concreteClient, tokenProvider: { tokenCache.read()?.value })
       ↓
AuthInterceptor(client: signedClient, onSessionLost: { authMachine.dispatch(.sessionLost) })
       ↓
Services
```

## Behavior rules

### SigningAdapter

1. On every `send(_:)` call: awaits `tokenProvider()` to obtain the current token string.
2. If `tokenProvider()` returns a value: injects `"Authorization": "Bearer \(value)"` into the request headers before forwarding.
3. If `tokenProvider()` returns nil: forwards the request without an `Authorization` header (the server will respond 401; `AuthInterceptor` handles the consequence).
4. Forwards the (possibly modified) request to the wrapped client unchanged in all other fields.
5. Returns the wrapped client's `HTTPResult` unchanged.
6. Calls `tokenProvider` on every request; does not cache the returned value between calls.

### AuthInterceptor

7. Passes the request to the wrapped client without modification.
8. On `HTTPResult.success(statusCode: 401, _)`: calls `onSessionLost()` exactly once, then returns the `HTTPResult` unchanged.
9. On any `HTTPResult.success` where `statusCode != 401`: returns the result unchanged; does not call `onSessionLost()`.
10. On `HTTPResult.failure(_)` (network or invalid response): returns the failure unchanged; does not call `onSessionLost()`.
11. Does not retry, suppress, or transform the response — it observes only.
12. Does not know what `onSessionLost` does.

## Tests (required)

Using `HTTPClient` fakes that capture received requests and return configured results:

### SigningAdapter

1. Request sent to spy has `Authorization: Bearer {value}` header when provider returns a value.
2. Request sent to spy has no `Authorization` header when provider returns nil.
3. All other request fields (method, path, body) are forwarded unchanged.
4. `tokenProvider` is called once per `send` invocation (not cached): two sequential calls with different provider return values produce two different headers.
5. Returns the spy's `HTTPResult` unchanged (pass-through for success response).
6. Returns the spy's `HTTPResult` unchanged (pass-through for network failure).

### AuthInterceptor

7. Request forwarded to wrapped client without modification (method, path, body, headers unchanged).
8. `401` response → `onSessionLost` called exactly once; original `HTTPResult` returned to caller.
9. `200` response → `onSessionLost` NOT called; result returned unchanged.
10. `404` response → `onSessionLost` NOT called; result returned unchanged.
11. `500` response → `onSessionLost` NOT called; result returned unchanged.
12. `HTTPResult.failure(.network(...))` → `onSessionLost` NOT called; failure returned unchanged.

## Done criteria

- `SigningAdapter` and `AuthInterceptor` both conform to `HTTPClient` as defined in the Repo Services spec.
- Neither type references auth state machine types directly; `onSessionLost` is a plain closure.
- `SigningAdapter` does not import or reference `TokenCache` or `Token` directly; it receives a `() async -> String?` closure.
- All listed tests pass.
