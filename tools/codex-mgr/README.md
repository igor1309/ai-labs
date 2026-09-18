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
- Each block shows the `5h` and `weekly` windows as `<pct>% used, resets <HH:MM dd.mm>`
- Reset times use the local timezone (resolved from `/etc/localtime`, falling back to UTC)
- Degrades gracefully per profile: `unavailable: OAuth token not found`,
  `unavailable: usage request failed`, or `unavailable: usage response was invalid`
- `--json` prints one JSON line per profile in the `ccswitch-limits --json` record shape,
  which [`select-account.sh --codex`](../account-rotation/README.md) ranks profiles from:
  - `account_number` is the profile's 1-based position in list order; `email` is the profile name
  - `status` is `ok`, `oauth_token_not_found`, `usage_request_failed`, or `invalid_usage_response`
  - with `ok`, `usage.five_hour` / `usage.seven_day` are the primary / secondary windows as
    `{utilization, resets_at}` (`resets_at` in ISO 8601 UTC), or `null` when the API omits the window

  ```json
  {"account_number":1,"email":"me@example.com","active":true,"status":"ok","usage":{"five_hour":{"utilization":12,"resets_at":"2026-03-24T00:00:00Z"},"seven_day":{"utilization":40,"resets_at":"2026-03-27T00:00:00Z"}}}
  ```
- Queries the Codex usage endpoint with the access token from each profile's
  `auth.json`; see `docs/research-codex-usage-api.md` for the endpoint contract

## Test

```sh
./codex-mgr-test.sh
```

## Requirements

- Bash 3.2+ (macOS default)
- `jq`, `curl`

## Storage

- Auth file: `~/.codex/auth.json`
- Profiles directory: `~/.codex-profiles` (override with `CODEX_PROFILES_DIR`),
  one `<email>/` per profile holding `auth.json` and `profile.json` (name, email, account ID)
- Active profile marker: `~/.codex-profiles/.active`

## Docs

- [`docs/research-codex-usage-api.md`](docs/research-codex-usage-api.md) — usage endpoint and `auth.json` structure
- [`docs/intake-limits-command.md`](docs/intake-limits-command.md) — intake brief for `limits` (historical)
