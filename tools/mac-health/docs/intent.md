---
date: 2026-05-23
model: claude-opus-4-7
description: "Intent for mac-health: a scheduled, low-footprint macOS health monitor that surfaces SSD, memory pressure, and stale-leftover signals without running a resident app"
inspiration:
  - https://github.com/CodeAlive-AI/ai-driven-development/blob/main/skills/maintaining-macos-health/
  - https://t.me/ai_driven/210
---

# Product Intent: mac-health

## Product outcome

The user notices SSD pressure, memory pressure, and accumulating disk leftovers early — before they degrade work — without paying the memory, battery, or attention cost of a resident menu-bar app like Stats or iStat Menus.

## Actors

- **User**: works on this Mac daily; wants signal, not a dashboard to babysit.

## User stories

### MH-001 — Catch memory pressure before it disrupts work

As the user,
I want to be alerted when memory pressure is sustained and swap is growing,
so that I can close apps before the system starts thrashing.

Acceptance signal: the user is alerted before the system starts swapping aggressively; the user is not alerted when the system is fine, even if some swap is already in use.

### MH-002 — Catch SSD pressure before writes start failing

As the user,
I want to be alerted when free SSD space crosses a low-water threshold,
so that I can free space before tooling, Xcode, or simulators start failing.

Acceptance signal: the user is alerted once when free disk crosses into the danger zone, and again if it gets meaningfully worse; the user is not pinged repeatedly while the situation is unchanged.

### MH-003 — See stale leftovers without acting on them automatically

As the user,
I want a periodic report of sizes for known leftover locations (DerivedData, Simulator caches, `~/Library/Caches`, old Homebrew downloads, `.Trash` items >30d),
so that I can decide when and what to clean up myself.

Acceptance signal: the user can read a current report of leftover sizes on demand; nothing under those locations is modified; the user is never interrupted by an alert about leftovers.

### MH-004 — Inspect history without running anything live

As the user,
I want a durable, structured record of every check,
so that I can reconstruct what happened around any incident without having anything running live.

Acceptance signal: the user can inspect a structured history of past checks at any time, including the period around past incidents, using ordinary terminal tools.

## Acceptance signals

- The system runs no resident process owned by mac-health between scheduled ticks.
- Alerts fire only on threshold crossings or sustained-bad trends, not on every tick where the value is already bad.
- The history is grep-friendly and parseable with ordinary terminal tools.
- Disabling mac-health is a single command; there is no app to quit.

## Boundaries and non-goals

- Not a replacement for Stats / iStat Menus. mac-health does not render live UI.
- Not an auto-cleaner. The leftovers check reports sizes; it never deletes.
- Not a CPU, GPU, fan, or temperature monitor. Out of scope.
- Not a multi-machine fleet tool. Single-machine, single-user.
- Not a ai-labs project. Lives under `tools/`; no CI workflow, no release unit, no `## Components` row, no `loc-dashboard` entry.

## Open product questions

- Should there be a separate "weekly summary" alert that surfaces leftover growth trends, or is on-demand inspection enough?

## Downstream traceability

| Story | Research | Pre-ADR / ADR | Spec | Implementation plan | Code / tests |
| --- | --- | --- | --- | --- | --- |
| MH-001 | n/a | [adr.md](adr.md) | [spec.md](spec.md) | n/a | `checks/check-memory.sh` |
| MH-002 | n/a | [adr.md](adr.md) | [spec.md](spec.md) | n/a | `checks/check-disk.sh` |
| MH-003 | n/a | [adr.md](adr.md) | [spec.md](spec.md) | n/a | `checks/check-leftovers.sh` |
| MH-004 | n/a | [adr.md](adr.md) | [spec.md](spec.md) | n/a | log path + `newsyslog/mac-health.conf` |

