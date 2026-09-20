---
date: 2026-09-20
model: gpt-5
description: "Usage, OAuth refresh, retry, and locking behavior for ccswitch-limits."
---

# Ccswitch Limits

Prints Anthropic usage limits for every account managed by `ccswitch`.

## Usage

```sh
./ccswitch-limits.sh
# Machine-readable JSON Lines, one object per account:
./ccswitch-limits.sh --json
```

## Test

```sh
./ccswitch-limits-test.sh
```

## Behavior

- reads accounts from `~/.claude-switch-backup/sequence.json`
- reads per-account OAuth tokens from Keychain (`Claude Code-Account-N-email`)
- treats the live `Claude Code-credentials` item as authoritative for the active account; the saved per-account copy is only a fallback when the live item is absent
- checks `expiresAt` with a five-minute safety margin and refreshes expiring credentials before requesting usage
- serializes refresh-token rotation with a per-account `shlock`, re-reads credentials after acquiring the lock, and writes the complete rotated credential back to the same Keychain item
- on usage HTTP `401` or `403`, refreshes once and retries; on `429`, honors `Retry-After` once and retries
- formats reset times as `HH:mm DD.MM`
- uses the Mac local timezone when available, otherwise `Europe/Moscow`
- `--json` emits one JSON object per account, preserving the parsed API response in `usage`
- JSON mode emits structured statuses (`oauth_token_not_found`, `usage_request_failed`, or `invalid_usage_response`) for unavailable accounts

## Notes

- requires `jq`, `curl`, `shlock`, `security`, and `claude`
- uses `https://platform.claude.com/v1/oauth/token` for refreshes and `https://api.anthropic.com/api/oauth/usage` for quota reads
- lock files live under `~/.claude-switch-backup/locks/`; stale locks are recovered by `shlock`
- if no token is found for an account, prints `OAuth token not found`
- if the API rejects all available tokens, prints `usage request failed`
- an account without a refresh token cannot recover from an expired or rejected access token until it is logged in again
