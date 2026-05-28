---
date: 2026-05-02
model: gpt-5
description: "Spec for replacing Clipdeck's shared-secret gate with Cloudflare Access single-owner authentication"
status: draft
artifact_type: spec
---

# Spec: Cloudflare Access Authentication for Clipdeck

## Goal

Protect production Clipdeck with Cloudflare Access for the owner's single identity, removing the app-level shared-secret unlock flow while preserving Worker-only GitHub access.

## Public interface

### Production hostname

- The canonical production hostname is `clipdeck.enoa.ai`.
- Requests to `https://clipdeck.enoa.ai/` serve the Clipdeck static page only after Cloudflare Access accepts the owner identity.
- Requests to `https://clipdeck.enoa.ai/api/items` serve the existing item API only after Cloudflare Access accepts the owner identity.

### Cloudflare Access policy

- A Cloudflare Access self-hosted application protects the entire `clipdeck.enoa.ai` hostname.
- The application policy allows only the owner's primary Cloudflare Access identity.
- The concrete email address or identity selector is configured in Cloudflare and may be recorded only in non-source-controlled operator notes.
- Email one-time PIN is allowed. Another Cloudflare-supported identity provider is allowed only when it authenticates the same owner identity and does not broaden the principal set.

### Frontend

- The frontend has no Clipdeck-specific unlock form.
- The frontend has no Clipdeck-specific secret input.
- The frontend does not store or read `clipdeck.secret` in browser storage.
- The frontend calls `/api/items` without an `Authorization: Bearer <shared-secret>` header.

### `GET /api/items`

Request: no Clipdeck-specific authentication parameters.

Success response (`200`): unchanged from `spec-iphone-copy-library.md`.

Error responses after a request reaches the Worker: unchanged from `spec-iphone-copy-library.md`, except app-level `401 {"error":"unauthorized"}` for missing or incorrect shared secret is removed from the production contract.

Unauthenticated production requests are handled by Cloudflare Access before reaching the Worker. They must not receive item data, the static Clipdeck app shell, GitHub tokens, raw GitHub API responses, or YAML front matter.

For this spec, "handled by Cloudflare Access" means the response is one of:

- an HTTP `302` or `303` redirect whose `Location` header points to a Cloudflare Access authentication path
- an HTTP `401` or `403` response that is not the Worker JSON body `{"error":"unauthorized"}`

### Runtime secrets

- `GITHUB_TOKEN` remains the Worker secret used for private GitHub reads.
- `SHARED_SECRET` is no longer part of the final production runtime contract.
- A temporary `SHARED_SECRET` rollback window is allowed only when documented in the operator runbook.

## Behavior rules

### Access boundary

- Cloudflare Access MUST challenge or deny unauthenticated requests before the Worker serves static assets or `/api/items`.
- The Access application MUST cover the full hostname, not only `/api/items`.
- Unauthenticated requests to `/` MUST NOT receive the Clipdeck static page.
- Unauthenticated requests to `/api/items` MUST NOT receive item data.
- The production Worker MUST NOT be reachable through an alternate public hostname that bypasses Cloudflare Access.

### Owner identity

- The Access policy MUST be single-owner.
- The Access policy MUST be deny-by-default for every identity other than the owner identity.
- Source-controlled files MUST NOT contain the concrete owner email address or identity selector.
- Source-controlled operator runbooks MUST NOT contain the concrete owner email address or identity selector.
- Broadening access to additional users, groups, organizations, service tokens, or device-posture rules is outside this spec and requires an ADR amendment or successor ADR.

### Worker authentication

- The Worker MUST NOT require a Clipdeck shared secret for `GET /api/items` after Cloudflare Access is active.
- The Worker MUST NOT validate `Authorization: Bearer <shared-secret>` as the final production access boundary.
- The Worker MUST continue to read the private GitHub source repo only through `GITHUB_TOKEN`.
- The Worker MUST NOT expose `GITHUB_TOKEN` or credential state in any response.

### Frontend behavior

- On page load, an Access-authenticated browser session MUST load the item list without a Clipdeck unlock step.
- A failed `/api/items` fetch after Access authentication MUST surface the same non-auth API errors defined by `spec-iphone-copy-library.md`.
- The page MUST NOT persist, clear, or migrate `clipdeck.secret`.

### Deploy verification

- The deploy workflow MUST replace the old unauthenticated Worker `401` check with a Cloudflare Access lock check.
- The deploy workflow MUST NOT authenticate as the owner.
- The deploy workflow MUST NOT use Cloudflare Access session cookies, one-time PINs, owner credentials, `GITHUB_TOKEN`, or `SHARED_SECRET`.
- A valid unauthenticated deploy check proves that `https://clipdeck.enoa.ai/api/items` is handled by Cloudflare Access, as defined in the Public interface section, and does not return item data.

### Secret cleanup

- After production Access protection is verified, `SHARED_SECRET` MUST be removed from the production Worker secret set unless a rollback window is documented.
- Removing `SHARED_SECRET` MUST NOT affect GitHub reads, item discovery, front matter stripping, item ordering, or copy behavior.

## Tests

1. The Cloudflare Access application configuration covers `clipdeck.enoa.ai/*`.
2. The Cloudflare Access policy allows exactly the owner identity configured outside source control.
3. The Cloudflare Access policy denies every other identity by default.
4. Source-controlled Clipdeck docs, specs, operator runbooks, configuration, tests, and source files do not contain the concrete owner email address or identity selector.
5. An unauthenticated `GET https://clipdeck.enoa.ai/` returns an Access-handled response as defined in the Public interface section and does not return the Clipdeck static page.
6. An unauthenticated `GET https://clipdeck.enoa.ai/api/items` returns an Access-handled response as defined in the Public interface section and does not return a JSON object with a `sections` key.
7. An unauthenticated `GET https://clipdeck.enoa.ai/api/items` does not return the old Worker response body `{"error":"unauthorized"}`.
8. An authenticated owner browser session can load `https://clipdeck.enoa.ai/`.
9. An authenticated owner browser session can fetch `/api/items` without an `Authorization` header and receives the existing `200` sections response.
10. The frontend source contains no unlock form behavior.
11. The frontend source contains no shared-secret input behavior.
12. The frontend source does not read, write, or remove `localStorage["clipdeck.secret"]`.
13. The frontend `/api/items` fetch does not set an `Authorization` header.
14. The Worker API code does not compare any request value to `env.SHARED_SECRET`.
15. The Worker environment type does not require `SHARED_SECRET`.
16. The production Worker has no unprotected alternate public hostname that can serve `/api/items` without Cloudflare Access.
17. The deploy workflow's unauthenticated production check expects Cloudflare Access protection, not a Worker-generated shared-secret `401`.
18. The deploy workflow's production check does not use owner credentials, Cloudflare Access cookies, one-time PINs, `GITHUB_TOKEN`, or `SHARED_SECRET`.
19. After `SHARED_SECRET` is removed from the production Worker secret set, an authenticated owner request to `/api/items` still returns `200`.
20. A GitHub credential failure after Access authentication still returns the `502` upstream-GitHub-failure response from `spec-iphone-copy-library.md` and does not expose token bytes or credential state.
21. Prompt and skill item response shape, ordering, front matter stripping, and copy behavior remain unchanged from `spec-iphone-copy-library.md`.

## Done criteria

- Cloudflare Access protects `clipdeck.enoa.ai` for the single owner identity.
- Clipdeck no longer has an app-level shared-secret unlock flow in production.
- `GET /api/items` works for an Access-authenticated owner session without a Clipdeck `Authorization` header.
- Unauthenticated production requests are blocked by Cloudflare Access before item data or static app content is served.
- The deploy verification checks Access protection without authenticating as the owner.
- `SHARED_SECRET` is removed from the final production Worker secret contract or its temporary rollback window is documented.
- All tests in this spec pass.
