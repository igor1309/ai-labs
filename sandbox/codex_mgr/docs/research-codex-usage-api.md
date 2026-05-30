---
date: 2026-05-30
model: claude-opus-4-8
description: "Research notes on the Codex CLI usage/limits API and auth.json structure"
---

# Research: Codex CLI Usage/Limits API

Source: web research of the openai/codex Rust source, official docs, and 2025–2026
issues/PRs (via subagent). Confirmed against ~`rust-v0.131`/`v0.132` (May 2026). This
is an **undocumented internal ChatGPT backend**; exact strings are version-dependent
and should be re-verified if Codex changes the contract.

**Verified live on 2026-05-30:** `codex-mgr limits` successfully queried
`GET https://chatgpt.com/backend-api/wham/usage` with the access token + account id
from each profile's `auth.json` and parsed `.rate_limit.primary_window` /
`.secondary_window` (`used_percent`, `reset_at`) for real accounts. The contract below
matches the live response.

## auth.json Structure

ChatGPT-login mode:

```json
{
  "auth_mode": "Chatgpt",
  "tokens": {
    "access_token": "eyJ...",
    "refresh_token": "...",
    "id_token": "eyJ...",
    "account_id": "chatgpt-act-..."
  },
  "last_refresh": "2026-04-17T10:00:00Z"
}
```

- `auth_mode` is `"Chatgpt"` (capital C) in recent Rust versions; older versions /
  third-party docs show lowercase — treat case-insensitively.
- `account_id` lives **inside** `.tokens`, not at top level. (The third-party
  `7shi/codex-oauth` project uses a different top-level `.accountId` camelCase schema —
  not the native format.)
- API-key mode: no `tokens` object; instead a top-level `"OPENAI_API_KEY": "sk-..."`.
- `last_refresh` ISO-8601; tokens treated stale after ~8 days.
- The Bearer value is `.tokens.access_token`. `id_token` is an OIDC identity token for
  claim extraction, not for API auth.

## Usage Endpoint

There is a dedicated GET endpoint returning parseable JSON (rate limits are not
header-only):

```
GET https://chatgpt.com/backend-api/wham/usage
```

The Rust client (`codex-rs/backend-client/src/client.rs`) normalises ChatGPT-family
base URLs to append `/wham/usage`. The `/api/codex/usage` path style is for
self-hosted / enterprise proxy base URLs, not ChatGPT consumer accounts.

### Request headers

| Header | Value | Notes |
|---|---|---|
| `Authorization` | `Bearer <tokens.access_token>` | access token, not id_token |
| `ChatGPT-Account-Id` | `<tokens.account_id>` | omit if account_id absent |
| `User-Agent` | `codex-cli` | default set by CLI |
| `X-OpenAI-Fedramp` | `"true"` | FedRAMP accounts only; omit otherwise |

`account_id` may alternatively be decoded from the JWT payload (fallback order:
top-level `chatgpt_account_id` → `https://api.openai.com/auth.chatgpt_account_id` →
`organizations[0].id`). If `.tokens.account_id` is populated, use it directly.

### Response shape (`RateLimitStatusPayload`)

```json
{
  "plan_type": "plus",
  "rate_limit": {
    "allowed": true,
    "limit_reached": false,
    "primary_window":   { "used_percent": 42, "limit_window_seconds": 18000,  "reset_after_seconds": 7341,   "reset_at": 1748700000 },
    "secondary_window": { "used_percent": 12, "limit_window_seconds": 604800, "reset_after_seconds": 259200, "reset_at": 1748959200 }
  },
  "credits": { "has_credits": true, "unlimited": false, "balance": "4.20" },
  "additional_rate_limits": [
    { "limit_name": "code_review", "metered_feature": "code_review", "rate_limit": { } }
  ],
  "rate_limit_reached_type": null
}
```

Exact field names from the Rust structs (source of truth):

- `RateLimitStatusPayload`: `plan_type`, `rate_limit`, `credits`,
  `additional_rate_limits`, `rate_limit_reached_type`
- `RateLimitStatusDetails`: `allowed`, `limit_reached`, `primary_window`,
  `secondary_window`
- `RateLimitWindowSnapshot`: `used_percent` (i32), `limit_window_seconds` (i32),
  `reset_after_seconds` (i32), `reset_at` (i32 Unix epoch **seconds**)
- `CreditStatusDetails`: `has_credits`, `unlimited`, `balance` (string or null)
- `AdditionalRateLimitDetails`: `limit_name`, `metered_feature`, `rate_limit`

`primary_window` ≈ ~5h session window; `secondary_window` ≈ weekly quota. `reset_at` is
Unix epoch **seconds** (use `jq … | strftime`). There is no `resets_in_seconds` or
string `resets_at` on this endpoint — those appear only in 429 error bodies from the
Responses API.

## Shell Recipe (reference)

Direct GET, no dummy POST needed:

```bash
ACCESS_TOKEN=$(jq -r '.tokens.access_token' "$AUTH_FILE")
ACCOUNT_ID=$(jq -r '.tokens.account_id // empty' "$AUTH_FILE")

USAGE=$(curl -sf \
  --header "Authorization: Bearer $ACCESS_TOKEN" \
  ${ACCOUNT_ID:+--header "ChatGPT-Account-Id: $ACCOUNT_ID"} \
  --header "User-Agent: codex-cli" \
  "https://chatgpt.com/backend-api/wham/usage")

echo "$USAGE" | jq -r '
  .rate_limit.primary_window |
  "  primary:   \(.used_percent)% used, resets \(.reset_at | strftime("%H:%M %d.%m"))"'
```

## Caveats to Handle

1. **Token expiry** → HTTP 401. The CLI refreshes internally via
   `POST https://auth.openai.com/oauth/token` with `refresh_token` (no supported public
   API). From a script, treat 401/failure as `unavailable: …`; do not attempt refresh.
2. **`account_id` may be absent** after some refresh cycles → omit the header
   (`${ACCOUNT_ID:+…}`). Works without it for personal (non-workspace) accounts.
3. **`secondary_window` may be null** for some plan types → guard formatting.
4. **`reset_at` is seconds**, not milliseconds.
5. **Version-dependent**: confirmed ~`rust-v0.131`/`v0.132` (May 2026); `/wham/usage`
   replaced an older `/api/codex/usage` path.

## Sources

- openai/codex repo: <https://github.com/openai/codex>
- `codex-rs/backend-client/src/client.rs` — URL/header construction
- `codex-rs/codex-backend-openapi-models/src/models/` — response types
  (`rate_limit_status_payload.rs`, `rate_limit_window_snapshot.rs`,
  `rate_limit_status_details.rs`)
- developers.openai.com/codex/app-server — `account/rateLimits/read` JSON-RPC method
- developers.openai.com/codex/auth/ci-cd-auth — `auth.json` jq examples
- 7shi/codex-oauth — Python reference impl (note: different schema)
- openai/codex issues #10869 (usage polling), #15281 (`/status` request), #19866 (auth)
