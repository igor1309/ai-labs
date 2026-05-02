---
date: 2026-01-29
model: gpt-5.2
description: "Usage and behavior for the codex-mgr profile manager"
---

# Codex Mgr

## Overview

`codex-mgr` is a standalone script for saving, listing, and switching Codex CLI auth profiles.

## Usage

- `codex-mgr save <email>`
- `codex-mgr load <email>`
- `codex-mgr list`
- `codex-mgr switch`
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

## Requirements

- Bash 4+ (uses `mapfile`)

## Storage

- Auth file: `~/.codex/auth.json`
- Profiles directory: `~/.codex-profiles` (override with `CODEX_PROFILES_DIR`)
