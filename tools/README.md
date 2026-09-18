---
date: 2026-06-24
model: claude-opus-4-7
description: "Tools — developer workflow helpers (git worktree manager, Claude account switcher, Codex profile manager)"
---

# tools

Small shell utilities and local workflow helpers.

## Description

Git worktree manager, Claude account switcher with usage-limit reporting, Codex CLI profile manager with usage-limit reporting — *small shell scripts* that smooth out daily friction. (The worktree shared-config symlinker moved into the `worktree` dev-skill under `dev-skills/public/worktree/scripts/`.)

## Components

| Component | Type | Description |
| --- | --- | --- |
| `ccswitch-limits` | CLI | Reports Anthropic usage limits for every `ccswitch`-managed Claude account |
| `cl` | CLI | Claude Code launcher — picks the account with the best quota pacing (or the one given), optionally resumes a session |
| `claude-account-switch` | Research | Exploration notes for an Alfred-based Claude Code account switcher |
| `codex-mgr` | CLI | Codex CLI auth-profile manager — save/load/switch profiles and report per-profile usage limits |
| `mac-health` | Scheduled checks | launchd-driven macOS health checks (memory, disk, leftovers) with a JSONL log and threshold notifications |
| `wt` | CLI | Git worktree manager — one command creates a branch and its worktree folder |

## Stack

- Bash
- Git
