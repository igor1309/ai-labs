---
date: 2026-03-25
model: claude-opus-4-6
description: "Usage notes for the ccswitch limits reporting script."
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
- for the active account, also reads the `Claude Code-credentials` token
- tries the per-account token first; if the API call fails (e.g. stale/expired token), retries with the active credentials token
- formats reset times as `HH:mm DD.MM`
- uses the Mac local timezone when available, otherwise `Europe/Moscow`
- `--json` emits one JSON object per account, preserving the parsed API response in `usage`
- JSON mode emits structured statuses (`oauth_token_not_found`, `usage_request_failed`, or `invalid_usage_response`) for unavailable accounts

## Notes

- requires `jq`, `curl`, `security`, and `claude`
- if no token is found for an account, prints `OAuth token not found`
- if the API rejects all available tokens, prints `usage request failed`
- inactive accounts with expired tokens cannot be queried until switched to
