---
date: 2026-01-29
model: gpt-5.2
description: "Usage and behavior for the codex-mgr profile manager"
---

# Codex Mgr

## Overview

`codex-mgr` is a standalone script for saving, listing, and switching Codex CLI auth profiles.

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
- `codex-mgr delete <email>`
- `codex-mgr help`
- Email is required and must include `@`
- Profile name is the email

## List Output

- Format: `* <profile>` for the active profile
- Non-active profiles are shown without the `*` marker
- Active profile is inferred from the current Codex auth

## Switch

- Switches to the next profile in list order and wraps to the first
- If no active profile is detected, switches to the first profile

## Limits

- Prints usage limits per profile, one block per saved profile
- Active profile is marked with `(active)`
- Each block shows the `5h` and `weekly` windows as `<pct>% used, resets <HH:MM dd.mm>`
- Reset times use the local timezone (resolved from `/etc/localtime`, falling back to UTC)
- Degrades gracefully per profile: `unavailable: OAuth token not found`,
  `unavailable: usage request failed`, or `unavailable: usage response was invalid`
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
- Profiles directory: `~/.codex-profiles` (override with `CODEX_PROFILES_DIR`)
