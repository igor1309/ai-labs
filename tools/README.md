---
date: 2026-05-10
model: claude-opus-4-7
description: "Tools — developer workflow helpers (git worktree manager, Claude account switcher, Codex profile manager, shared config symlinker)"
---

# tools

Small shell utilities and local workflow helpers.

## Description

Git worktree manager, Claude account switcher with usage-limit reporting, Codex CLI profile manager with usage-limit reporting, shared config symlinker for worktrees — *small shell scripts* that smooth out daily friction.

## Components

| Component | Type | Description |
| --- | --- | --- |
| `ccswitch-limits` | CLI | Reports Anthropic usage limits for every `ccswitch`-managed Claude account |
| `claude-account-switch` | Research | Exploration notes for an Alfred-based Claude Code account switcher |
| `codex-mgr` | CLI | Codex CLI auth-profile manager — save/load/switch profiles and report per-profile usage limits |
| `ensure-shared-config-links` | CLI | Symlinks each git worktree to a shared config directory |
| `mac-health` | Scheduled checks | launchd-driven macOS health checks (memory, disk, leftovers) with a JSONL log and threshold notifications |
| `retro` | Research | Research notes on agent retro / usage-analysis tooling |
| `wt` | CLI | Git worktree manager — one command creates a branch and its worktree folder |

## Stack

- Bash
- Git
