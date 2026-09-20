---
date: 2026-09-20
model: claude-opus-5
description: "Tools — developer workflow helpers (git worktree manager, scheduled macOS health checks)"
---

# tools

Small shell utilities and local workflow helpers.

## Description

Git worktree manager and scheduled macOS health checks — *small shell scripts* that smooth out daily friction. (The worktree shared-config symlinker moved into the `worktree` dev-skill under `dev-skills/public/worktree/scripts/`.)

The AI-account tooling — `cl`, `cx`, `codex-mgr`, `ccswitch-limits` and the shared `account-rotation` library — moved to the `inventory` repo under `tools/`, alongside the rest of the account and infrastructure inventory.

## Components

| Component | Type | Description |
| --- | --- | --- |
| `mac-health` | Scheduled checks | launchd-driven macOS health checks (memory, disk, leftovers) with a JSONL log and threshold notifications |
| `wt` | CLI | Git worktree manager — one command creates a branch and its worktree folder |

## Stack

- Bash
- Git
