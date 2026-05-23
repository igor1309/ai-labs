---
date: 2026-05-23
model: claude-opus-4-7
description: "Intent for mac-health: a scheduled, low-footprint macOS health monitor that surfaces SSD, memory pressure, and stale-leftover signals without running a resident app"
---

# Product Intent: mac-health

## Product outcome

The maintainer notices SSD pressure, memory pressure, and accumulating disk leftovers early — before they degrade work — without paying the memory, battery, or attention cost of a resident menu-bar app like Stats or iStat Menus.

## Actors

- **Maintainer**: works on this Mac daily; wants signal, not a dashboard to babysit.

## User stories

### MH-001 — Catch memory pressure before it disrupts work

As the maintainer,
I want to be notified when memory pressure is sustained and swap is growing,
so that I can close apps before the system starts thrashing.

Status: accepted

Acceptance signal: a macOS notification fires when the memory check detects critical pressure with a swap-growth trend across recent samples; no notification fires when swap is non-zero but stable.

### MH-002 — Catch SSD pressure before writes start failing

As the maintainer,
I want to be notified when free SSD space crosses a low-water threshold,
so that I can free space before tooling, Xcode, or simulators start failing.

Status: accepted

Acceptance signal: a macOS notification fires on threshold crossing (entering the danger zone), not on every check while already in the danger zone.

### MH-003 — See stale leftovers without acting on them automatically

As the maintainer,
I want a periodic report of sizes for known leftover locations (DerivedData, Simulator caches, `~/Library/Caches`, old Homebrew downloads, `.Trash` items >30d),
so that I can decide when and what to clean up myself.

Status: accepted

Acceptance signal: the leftover check appends a sizes report to the log; it never deletes anything; no notification fires for leftovers.

### MH-004 — Inspect history without running anything live

As the maintainer,
I want every check to append a single structured line to a rolling log,
so that I can `tail` or `jq` the file when curious and reconstruct what happened around any incident.

Status: accepted

Acceptance signal: one JSONL line per check is written to `~/Library/Logs/mac-health/health.log`; the file is rotated by `newsyslog` at a fixed size.

## Acceptance signals

- The system runs no resident process owned by mac-health between scheduled ticks.
- Notifications fire only on threshold crossings or sustained-bad trends, not on every tick where the value is already bad.
- The log is grep-friendly and parseable by `jq`.
- Disabling mac-health is one `launchctl` command per agent; no app to quit.

## Boundaries and non-goals

- Not a replacement for Stats / iStat Menus. mac-health does not render live UI.
- Not an auto-cleaner. The leftovers check reports sizes; it never deletes.
- Not a CPU, GPU, fan, or temperature monitor. Out of scope.
- Not a multi-machine fleet tool. Single-machine, single-user.
- Not a ai-labs project. Lives under `tools/`; no CI workflow, no release unit, no `## Components` row, no `loc-dashboard` entry.

## Open product questions

- Should there be a separate "weekly summary" notification that surfaces leftover growth trends, or is on-demand log inspection enough?

## Downstream traceability

| Story | Research | Pre-ADR / ADR | Spec | Implementation plan | Code / tests |
| --- | --- | --- | --- | --- | --- |
| MH-001 | n/a | [adr.md](adr.md) | [spec.md](spec.md) | n/a | `checks/check-memory.sh` |
| MH-002 | n/a | [adr.md](adr.md) | [spec.md](spec.md) | n/a | `checks/check-disk.sh` |
| MH-003 | n/a | [adr.md](adr.md) | [spec.md](spec.md) | n/a | `checks/check-leftovers.sh` |
| MH-004 | n/a | [adr.md](adr.md) | [spec.md](spec.md) | n/a | log path + `newsyslog/mac-health.conf` |

## Change review

| Change | Impact review |
| --- | --- |
| Editorial wording without changing actor, capability, outcome, acceptance signal | no downstream review |
| Adding or removing a check (e.g., adding CPU monitoring) | revisit boundaries, ADR scope, spec |
| Changing notification policy (e.g., notify on every tick) | revisit MH-001/MH-002 acceptance signals |
| Adding any delete-by-default behavior | revisit MH-003 acceptance signal explicitly |
