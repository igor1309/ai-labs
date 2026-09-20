---
date: 2026-09-18
model: claude-opus-5
description: "Usage and behavior for the codex-mgr profile manager"
---

# Codex Mgr

## Overview

`codex-mgr` is a standalone script for saving, listing, and switching Codex CLI auth profiles, and for reporting each profile's usage limits.

[`cx`](../cx/README.md) builds on it to start Codex on the profile with the best quota pacing.

## Install

Make `codex-mgr` invokable from any shell by symlinking it into a directory on your `PATH`:

```sh
./install.sh
```

- Default target: `~/.local/bin/codex-mgr` (override with `CODEX_MGR_BIN_DIR`)
- The installer warns if the target directory is not on your `PATH`
- Remove the symlink with `./uninstall.sh`

Manual alternative:

```sh
ln -s "$PWD/codex-mgr.sh" ~/.local/bin/codex-mgr
```

## Usage

- `codex-mgr save <email>`
- `codex-mgr load <email>`
- `codex-mgr list`
- `codex-mgr switch`
- `codex-mgr limits`
- `codex-mgr limits --json`
- `codex-mgr delete <email>`
- `codex-mgr help`
- Email is required and must include `@`
- Profile name is the email

## Load

- Copies the profile's `auth.json` over `~/.codex/auth.json` and records the profile in `.active`
- Backs up the current auth to `~/.codex/auth.json.backup.<epoch>` first
- Before switching away, copies the live auth back into the active profile (unless its account ID differs): Codex rotates refresh tokens in place, so the saved snapshot would otherwise hold a consumed token and force a re-login

## List Output

- Format: `* <profile>` for the active profile
- Non-active profiles are shown without the `*` marker
- Active profile is inferred from the current Codex auth: a profile whose `auth.json` matches it exactly, else the `.active` marker, else a profile with the same account ID

## Switch

- Switches to the next profile in list order and wraps to the first
- If no active profile is detected, switches to the first profile
- Syncs and backs up the live auth like `load`

## Limits

- Prints usage limits per profile, one block per saved profile
- Active profile is marked with `(active)`
- Queries the active account through Codex app-server's supported `account/rateLimits/read` API; Codex owns token refresh and persistence in live `~/.codex/auth.json`
- Queries inactive saved profiles read-only through the internal WHAM compatibility endpoint; it never refreshes or rewrites copied credentials
- If app-server is unavailable, the active account also uses WHAM as a compatibility fallback, but with the live auth file rather than the saved profile snapshot
- Matches the `5h` and `weekly` compatibility windows by their reported durations (300 and 10,080 minutes), not by primary/secondary position
- Shows every returned limit bucket and window as `<pct>% used, resets <HH:MM dd.mm>`; missing windows remain missing
- Shows available reset credits and, when WHAM reports it, how many are currently applicable
- Reset times use the local timezone (resolved from `/etc/localtime`, falling back to UTC)
- Degrades gracefully per profile: `unavailable: OAuth token not found`,
  `unavailable: usage request failed`, or `unavailable: usage response was invalid`
- `--json` prints one JSON line per profile in the `ccswitch-limits --json` record shape,
  which [`select-account.sh --codex`](../account-rotation/README.md) ranks profiles from:
  - `account_number` is the profile's 1-based position in list order; `email` is the profile name
  - `status` is `ok`, `oauth_token_not_found`, `usage_request_failed`, or `invalid_usage_response`
  - with `ok`, `source` is `app_server` or `wham_fallback`
  - `usage.five_hour` / `usage.seven_day` preserve the account-rotation compatibility view as `{utilization, resets_at, window_duration_mins}`, selected by duration, or `null` when absent
  - `limit_buckets` contains every returned bucket and window
  - `reset_credits` contains `available_count`, `applicable_available_count` when known, and any returned credit details

  ```json
  {"account_number":1,"email":"me@example.com","active":true,"status":"ok","source":"app_server","usage":{"five_hour":{"utilization":12,"resets_at":"2026-03-24T00:00:00Z","window_duration_mins":300},"seven_day":{"utilization":40,"resets_at":"2026-03-27T00:00:00Z","window_duration_mins":10080}},"limit_buckets":[{"limit_id":"codex","limit_name":null,"primary":{"utilization":12,"resets_at":"2026-03-24T00:00:00Z","window_duration_mins":300},"secondary":{"utilization":40,"resets_at":"2026-03-27T00:00:00Z","window_duration_mins":10080}}],"reset_credits":{"available_count":0,"applicable_available_count":null,"credits":[]}}
  ```
- See `docs/research-codex-usage-api.md` for the supported and compatibility endpoint contracts

## Test

```sh
./codex-mgr-test.sh
```

## Requirements

- Bash 3.2+ (macOS default)
- `codex`, `jq`, `curl`

## Storage

- Auth file: `~/.codex/auth.json`
- Profiles directory: `~/.codex-profiles` (override with `CODEX_PROFILES_DIR`),
  one `<email>/` per profile holding `auth.json` and `profile.json` (name, email, account ID)
- Active profile marker: `~/.codex-profiles/.active`

## Docs

- [`docs/research-codex-usage-api.md`](docs/research-codex-usage-api.md) — app-server limits, WHAM compatibility, and auth ownership
- [`docs/intake-limits-command.md`](docs/intake-limits-command.md) — intake brief for `limits` (historical)
