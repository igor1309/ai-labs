---
date: 2026-05-23
model: claude-opus-4-7
description: "mac-health architecture: scheduled launchd agents, JSONL rolling log, threshold-crossing notifications, report-only leftovers, run-from-repo"
---

# ADR-001 — mac-health Architecture

## Executive summary

mac-health runs as a small set of per-user `launchd` agents on a fixed cadence. Each tick is a short-lived shell script that writes one JSONL line to a `newsyslog`-rotated log and fires a `terminal-notifier` notification only on threshold crossings. Scripts run directly from `tools/mac-health/` in this repo — no separate install location. The leftovers check is report-only by contract.

## Context

The maintainer wants visibility into SSD pressure, memory pressure, and accumulating disk leftovers without paying the cost of a resident app (memory, battery, attention). Existing options (Stats, iStat Menus) solve the visibility problem by adding a permanently running process and menu-bar UI. mac-health takes the opposite tradeoff: no resident process, no UI, periodic background checks with alerts only when something is wrong.

Constraints that shaped the decision:

- macOS is the only target.
- The maintainer's laptop sleeps unpredictably — schedules must survive sleep.
- The maintainer is comfortable in the terminal; `jq`/`tail` are acceptable inspection tools.
- Auto-cleanup of "stale" files is a known foot-gun; "stale" is context-dependent (active Xcode build vs. abandoned project).
- The tool is host-level personal infrastructure; it does not belong to any ai-labs project.

Alternatives considered:

- **cron**: rejected — deprecated on macOS, silently skips runs scheduled while the laptop is asleep. `launchd` is the supported scheduler and handles missed runs.
- **Resident menu-bar daemon**: rejected — defeats the explicit non-goal of "no resident process." Would replicate Stats with worse polish.
- **System-wide `LaunchDaemon`**: rejected — notifications require running under the logged-in user; `LaunchDaemon` runs as root with no user session.
- **Auto-delete leftovers by default**: rejected — heuristics for "stale" are unreliable; a wrong delete during active work is catastrophic. Report-only is the safe default; cleanup is a separate manual action.
- **Plain-text key=value log**: rejected for the primary format — JSONL is parseable by `jq` for trend detection ("growing swap across last N samples") with far less code than regex over key=value.
- **Install to `~/bin/mac-health/` via copy or symlink**: rejected — adds a sync problem (repo vs. installed copy) for no real benefit. `launchd` points directly at script paths inside the repo.
- **`osascript -e 'display notification'`**: rejected — Apple has degraded the API (sender always shows as "Script Editor", no reliable action callbacks). `terminal-notifier` is a maintained Homebrew package with a proper API.

## Decision

- Scheduling: per-user `launchd` LaunchAgents in `~/Library/LaunchAgents/`. One agent per check cadence.
- Checks: short-lived shell scripts (bash/zsh). No long-running process.
- Cadence: memory check every 5 minutes; disk + leftovers check every 30 minutes.
- Log: JSONL, append-only, single file at `~/Library/Logs/mac-health/health.log`, rotated by `newsyslog` at 1MB with 5 gzipped archives.
- Notifications: `terminal-notifier` (Homebrew), fired only on threshold crossing or sustained-bad trend — never on every tick while in a bad state. No notifications for the leftovers check.
- Leftovers: report sizes only; never delete.
- Location: scripts, plists, and `newsyslog` config are version-controlled under `tools/mac-health/`. `launchd` points directly at the in-repo script paths. No copy or symlink to `~/bin/`.
- Repo role: `tools/mac-health/` is personal infrastructure, not an ai-labs project. It has a `README.md` and a one-line entry in `docs/log.md` when it lands. It does not appear in the README `## Components` table, `loc-dashboard`, release units, or per-project CI.

## Rules / invariants

- The leftovers check MUST NOT delete files. Reporting only.
- Notifications MUST fire only on threshold crossing or sustained-bad trend. A check that observes a bad state already alerted on MUST NOT re-notify.
- All checks MUST exit within 5 seconds on a healthy machine. Long-running work has no place in a tick.
- All checks MUST append exactly one JSONL line per run to the log file.
- LaunchAgents MUST be per-user (`~/Library/LaunchAgents/`), not system (`/Library/LaunchDaemons/`).
- The `newsyslog` config MUST cap log growth at 1MB rotation with 5 gzipped archives.
- `tools/mac-health/` MUST NOT be added to the README `## Components` table, `loc-dashboard`, `release-units.config.toml`, or any per-project CI workflow.

## Consequences

- Zero resident memory cost between ticks; the OS scheduler bears the orchestration.
- Trend detection (e.g., growing swap) requires reading the last N JSONL lines on each tick — slightly more work per tick than a stateless check, but trivially cheap at this cadence.
- The maintainer must have `terminal-notifier` installed via Homebrew. `install.sh` checks for it and tells the user to install if missing.
- Notification rate-limiting is encoded by reading the last log line per check to detect crossings — no separate state file.
- Because scripts run directly from the repo path, deleting or moving the ai-labs checkout breaks mac-health. Accepted: the maintainer controls the checkout location and is the only user.
- Disabling mac-health requires `launchctl bootout` on each agent; the `uninstall.sh` script wraps this.

## Non-goals

- CPU, GPU, fan, temperature, network monitoring.
- Multi-machine or fleet support.
- Auto-cleanup of leftovers.
- A menu-bar or any live UI.
- Cross-platform (Linux, Windows).
