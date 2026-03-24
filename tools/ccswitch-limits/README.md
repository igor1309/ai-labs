---
date: 2026-03-24
model: gpt-5.4
description: "Usage notes for the ccswitch limits reporting script."
---

# Ccswitch Limits

Prints Anthropic usage limits for every account managed by `ccswitch`.

## Usage

```sh
./ccswitch-limits.sh
```

## Test

```sh
./ccswitch-limits-test.sh
```

## Behavior

- reads accounts from `~/.claude-switch-backup/sequence.json`
- reads per-account tokens from Keychain
- falls back to `Claude Code-credentials` for the active account
- formats reset times as `HH:mm DD.MM`
- uses the Mac local timezone when available, otherwise `Europe/Moscow`

## Notes

- requires `jq`, `curl`, `security`, and `claude`
- if tokens are missing, the script prints `OAuth token not found`
