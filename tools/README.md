---
date: 2026-09-20
model: claude-opus-5
description: "Tools — developer workflow helpers (git worktree manager, scheduled macOS health checks)"
---

# tools

Small shell utilities and local workflow helpers.

## Description

Git worktree manager, scheduled macOS health checks, and agent-session audits — *small scripts* that smooth out daily friction. (The worktree shared-config symlinker moved into the `worktree` dev-skill under `dev-skills/public/worktree/scripts/`.)

The AI-account tooling — `cl`, `cx`, `codex-mgr`, `ccswitch-limits` and the shared `account-rotation` library — moved to the `inventory` repo under `tools/`, alongside the rest of the account and infrastructure inventory.

## Components

| Component | Type | Description |
| --- | --- | --- |
| `agister-gate` | Go command | Drives one step of a change through Agister's implement, review and fix gate (LAB-203) |
| `mac-health` | Scheduled checks | launchd-driven macOS health checks (memory, disk, leftovers) with a JSONL log and threshold notifications |
| `sessions-audit` | Python scripts | Audit local Claude Code and Codex transcripts for context-expanding behavior (full/repeated reads, unfiltered builds, polling, large tool results) |
| `wt` | CLI | Git worktree manager — one command creates a branch and its worktree folder |

## Stack

- Bash
- Go
- Git
- Python 3
