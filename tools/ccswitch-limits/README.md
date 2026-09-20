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
- treats every Keychain item as read-only: `ccswitch` writes both the live item and saved per-account items without a shared lock, while Keychain offers no compare-and-swap update
- checks `expiresAt` with a five-minute safety margin and skips credentials that are expired or about to expire
- on usage HTTP `401` or `403`, fails that account without rewriting credentials; on `429`, honors `Retry-After` once, capped at 30 seconds, and retries
- formats reset times as `HH:mm DD.MM`
- uses the Mac local timezone when available, otherwise `Europe/Moscow`
- `--json` emits one JSON object per account, preserving the parsed API response in `usage`
- JSON mode emits structured statuses (`oauth_token_not_found`, `usage_request_failed`, or `invalid_usage_response`) for unavailable accounts

## Notes

- requires `jq`, `curl`, `security`, and `claude`
- uses `https://api.anthropic.com/api/oauth/usage` for quota reads
- if no token is found for an account, prints `OAuth token not found`
- if the API rejects all available tokens, prints `usage request failed`
- expired or rejected credentials must be refreshed by Claude Code (for example, by opening that account and using `/usage`) before this read-only reporter can query them
