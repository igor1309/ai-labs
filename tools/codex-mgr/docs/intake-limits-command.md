---
date: 2026-05-30
model: claude-opus-4-8
description: "Intake brief for adding a `limits` subcommand to codex_mgr, mirroring ccswitch-limits"
---

# Intake: codex-mgr `limits` Command

> **Addendum (2026-05-30):** This brief is a frozen snapshot from intake, when the
> tool still lived at `sandbox/codex_mgr/`. The `limits` command was implemented and,
> in the same line of work, the tool was promoted to `tools/codex-mgr/` (script renamed
> to `codex-mgr.sh`, with `install.sh`/`uninstall.sh`). Paths below reflect the original
> sandbox location and the then-current "no promotion" scope; they are intentionally
> left unchanged as the historical record.

## What I'm Building

A new `limits` subcommand for `sandbox/codex_mgr/codex_mgr.sh` that, for each saved
Codex profile in `~/.codex-profiles`, fetches and prints that account's usage /
rate-limit status — mirroring what `tools/ccswitch-limits` does for Claude accounts.

Output is a per-account block: a header line identifying the profile (with an
`(active)` marker on the live one), followed by indented usage lines (percent-used +
reset time per window), with graceful `unavailable: …` lines when a token is missing
or the API call fails.

When done: `codex-mgr limits` exists alongside `save/load/list/switch/delete`, is
documented in `show_help` and `README.md`, the line-3 usage comment header lists it,
and a mocked test covers it.

## What I'm Touching

- `sandbox/codex_mgr/codex_mgr.sh` — add a `"limits")` branch to the main `case`,
  helper function(s) for token extraction + API query + window formatting; update the
  `# Usage:` header comment (line 3) and `show_help` (lines 19–48).
- `sandbox/codex_mgr/README.md` — add `limits` to the Usage list and a short
  output-format section.
- `sandbox/codex_mgr/codex_mgr-test.sh` (new) — mocked test for the `limits` command,
  following the ccswitch-limits test pattern.
- Reference only (not modified): `tools/ccswitch-limits/ccswitch-limits.sh` (structure
  to mirror) and `tools/ccswitch-limits/ccswitch-limits-test.sh` (test pattern).

## Findings

- **Scope:** Read the full target script (331 lines), the reference tool + its test
  (both ccswitch-limits files), codex_mgr README/TODO. Grepped `tools/` and
  `sandbox/codex_mgr/` for usage/limit/endpoint references. Spawned a research subagent
  for the Codex usage API contract. Excluded `worktrees/*` copies (duplicates).
- **Pattern evidence:** Strong analog — `tools/ccswitch-limits/ccswitch-limits.sh` is a
  complete, tested implementation of exactly this shape (iterate accounts → extract
  token → `curl` usage endpoint → format windows → handle unavailable). No
  Codex-specific usage/limits code exists anywhere in the repo.
- Profile discovery already exists in codex_mgr and is reusable: `get_profile_dirs`
  (line 76), `get_active_profile_dir` (line 80), `get_current_account_id` (line 58),
  `get_auth_field` (line 50). The `limits` branch should reuse these rather than
  reinventing iteration / active-detection.
- Codex tokens live in each profile's `auth.json` file (copied by `save`, line 154),
  not in the macOS keychain — so the Codex equivalent reads tokens from
  `"$dir/auth.json"` via `jq`, unlike ccswitch which calls `security
  find-generic-password`.
- ccswitch-limits formats two windows (`five_hour`, `seven_day`) with `utilization` %
  and `resets_at`, plus timezone-aware reset formatting via `date -j`. It degrades
  gracefully: `unavailable: OAuth token not found` / `usage request failed` /
  `usage response was invalid`.
- ccswitch-limits is `#!/bin/sh` POSIX; codex_mgr is `#!/bin/bash` with
  `set -euo pipefail` and Bash arrays. New code should follow codex_mgr's Bash style,
  not copy ccswitch's POSIX idioms verbatim.

## Codex Usage/Limits Contract (researched)

Resolved via web research of the openai/codex Rust source (subagent). Treat as a
candidate contract to verify, not as settled fact (see Risks).

- **Token source** (per profile `auth.json`): `.tokens.access_token` for the Bearer
  token; `.tokens.account_id` for the account header. codex_mgr's existing
  `.account_id // .tokens.account_id` fallback shows both shapes have appeared.
- **Endpoint:** `GET https://chatgpt.com/backend-api/wham/usage`
- **Headers:** `Authorization: Bearer <access_token>`,
  `ChatGPT-Account-Id: <account_id>` (omit if absent), `User-Agent: codex-cli`.
- **Response shape:** `.rate_limit.primary_window` (~5h) and
  `.rate_limit.secondary_window` (~weekly), each with `used_percent`,
  `limit_window_seconds`, `reset_after_seconds`, `reset_at` (Unix epoch seconds). Plus
  `.plan_type` and optional `.credits`. `secondary_window` may be null.

This maps cleanly onto ccswitch-limits: iterate profiles → read token from `auth.json`
→ `curl` the GET → `jq` the two windows → format `used_percent` + `reset_at`, with
`unavailable: …` fallbacks.

## Key Constraints

- This is a sandbox tool under testing (per `TODO.md`); changes stay within
  `sandbox/codex_mgr/` + its README. No promotion to `tools/` (a separate
  post-testing task).
- Mirror ccswitch-limits **behavior** (per-account block, active marker, graceful
  degradation), not its mechanism — token source is `auth.json`, not keychain.
- Preserve existing script conventions: `set -euo pipefail`, `get_auth_field`/`jq`
  helpers, `✓`/`⚠` message style, the `case` dispatch structure.
- Keep `show_help`, the line-3 usage comment, and `README.md` in sync (the repo already
  keeps all three aligned).
- Per the repo "Dependency API Versions in Specs" rule: a version floor does not
  guarantee API compatibility — verify the installed Codex API before hard-coding the
  endpoint/headers/field paths.

## Risks & Unknowns

- **The endpoint is an undocumented internal ChatGPT backend.** The path
  (`/wham/usage`), header casing (`ChatGPT-Account-Id`), and token field path
  (`.tokens.access_token`) were sourced from openai/codex Rust code as of ~`rust-v0.131`
  and are version-qualified. They must be confirmed against the installed Codex CLI or a
  live call before being hard-coded.
- **Token expiry:** the access token is a JWT that expires; a 401 means refresh is
  needed. The CLI refreshes internally (no supported public refresh API). The `limits`
  command should treat a failed call as `unavailable: …` rather than attempt a refresh.
- **`account_id` can be absent** after some refresh cycles; the account header must be
  conditionally omitted.
- **`secondary_window` can be null** for some plan types; formatting must guard for it.

## Test Scope

Add `sandbox/codex_mgr/codex_mgr-test.sh` (or extend an equivalent) modeled on
`tools/ccswitch-limits/ccswitch-limits-test.sh`:

- Mock `HOME` with a temp `~/.codex-profiles` containing 2–3 profile dirs (each with an
  `auth.json` holding a known `access_token`/`account_id`, and a `profile.json`).
- Mock `curl` on `PATH` to return canned `wham/usage` JSON keyed by the Authorization
  Bearer value, and to log the request line (URL + headers) for assertion.
- Assert golden output: per-profile block, `(active)` marker on the live profile,
  formatted `used_percent` + reset for both windows.
- Cover degradation cases: missing/empty token (`unavailable: OAuth token not found`),
  failed `curl` (`unavailable: usage request failed`), null `secondary_window`.
- Keep `TZ`-deterministic reset formatting (the ccswitch test fixes `TZ` and mocks
  `readlink /etc/localtime`).

Note: codex_mgr currently has no tests; this introduces the first one for the tool.

## Questions

None remaining. The one blocking unknown (the Codex usage/limits contract) was
resolved via research and is recorded above with its verification caveat.
