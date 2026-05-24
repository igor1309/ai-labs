---
date: 2026-05-23
model: claude-opus-4-7
description: "Spec: mac-health checks — memory, disk, leftovers — JSONL log format, threshold-crossing notification rules"
---

# Spec: mac-health (v0.1)

## Goal

Define the observable behavior of the three mac-health checks (memory, disk, leftovers), the JSONL log shape they share, and the notification rules. Operationalizes [adr.md](adr.md); satisfies [intent.md](intent.md) stories MH-001..MH-004.

## Public interface

mac-health has no programmatic interface. Its observable surface is:

- **The log file**: `~/Library/Logs/mac-health/health.log` — append-only JSONL, one line per check invocation, rotated by `newsyslog`.
- **macOS notifications**: zero or one per check invocation, via `terminal-notifier`.
- **Exit codes**: each check exits `0` on a successful run regardless of the health state it observed. Non-zero exit codes are reserved for check-internal errors (missing dependency, unwritable log) and are logged by `launchd` to its own diagnostic location.

### Log line shape

Every line is a single JSON object with at minimum:

- `ts`: ISO-8601 UTC timestamp, second precision.
- `check`: one of `memory`, `disk`, `leftovers`.
- `status`: one of `ok`, `warn`, `critical` (leftovers always reports `ok`).
- Check-specific fields (see Behavior rules).

## Behavior rules

### Memory check (MH-001)

1. Reads `memory_pressure` and `sysctl vm.swapusage`.
2. Emits one JSONL line with fields: `ts`, `check=memory`, `status`, `pressure` (one of `normal`, `warn`, `critical` as reported by `memory_pressure`), `swap_used_mb` (integer).
3. `status` is derived: `ok` if `pressure=normal`; `warn` if `pressure=warn`, or if `pressure=critical` AND swap is not trending up; `critical` if `pressure=critical` AND swap is trending up.
4. Swap-trending-up is defined as: across the last 6 memory-check entries in the log (including the current one), `swap_used_mb` is strictly non-decreasing, the current value is strictly greater than the oldest, and the current value exceeds 1024 MB.
5. A notification fires if and only if `status=critical` AND the previous memory-check log entry's `status` was not `critical`. (Threshold-crossing only — no re-notify while still critical.)
6. Notification content: title "mac-health: memory pressure critical", body includes current `swap_used_mb` and `pressure`.

### Disk check (MH-002)

1. Reads `df` for the user's data volume. On Catalina+ this is `/System/Volumes/Data` (the writable APFS data volume); on older macOS where that path does not exist, falls back to `/`. Querying `/` directly on Catalina+ misreports capacity because of the read-only system-snapshot/data-volume split.
2. Emits one JSONL line with fields: `ts`, `check=disk`, `status`, `free_gb` (integer), `free_pct` (integer).
3. `status` is derived from `free_pct`: `ok` if `>= 15`; `warn` if `>= 5` and `< 15`; `critical` if `< 5`.
4. A notification fires if and only if the current `status` is `warn` or `critical` AND the previous disk-check log entry's `status` was `ok`. (Threshold-crossing into the danger zone.) An additional notification fires on the `warn → critical` transition.
5. Notification content: title "mac-health: disk low" or "mac-health: disk critical", body includes `free_gb` and `free_pct`.

### Leftovers check (MH-003)

1. Reports sizes for: `~/Library/Developer/Xcode/DerivedData`, `~/Library/Developer/CoreSimulator/Caches`, `~/Library/Caches`, `~/Library/Caches/Homebrew/downloads` (if present), `~/.Trash` items with mtime older than 30 days.
2. Emits one JSONL line with fields: `ts`, `check=leftovers`, `status=ok`, `sizes` (object: location key → size in MB, integer).
3. MUST NOT delete, move, or modify any file under any of the inspected locations.
4. Never fires a notification.

### Log writing (MH-004)

1. Each check appends exactly one line to `~/Library/Logs/mac-health/health.log`.
2. The log directory is created on first run if missing.
3. Log rotation is delegated to `newsyslog`; the check writes through whichever file is currently at the canonical path.

### Notification policy (cross-cutting)

1. A check decides whether to notify by reading the most recent prior log entry for its own `check` value.
2. If the log file is empty or contains no prior entry for this check, the check treats the prior state as `ok` for the purpose of the crossing rule. (First-run after install does not surface stale state as a fresh alert unless the current state is bad.)
3. Notifications are best-effort. A failure to invoke `terminal-notifier` MUST NOT prevent the JSONL line from being written.
4. Each notification's click action opens the log file in the system default application. Without an explicit click action, the macOS notification "Show" button would default to activating the sender process (launchd), which has no UI.

### Dependency rules

1. `terminal-notifier` MUST be present on `PATH`. The install script checks this and refuses to install LaunchAgents if missing.
2. `jq` is NOT required at runtime.

## Product intent traceability

| Behavior rule | Story |
| --- | --- |
| Memory check rules 1–6 | MH-001 |
| Disk check rules 1–5 | MH-002 |
| Leftovers check rules 1–4 | MH-003 |
| Log writing rules 1–3 | MH-004 |

## Tests (required)

Tests run each check against a synthetic log fixture and assert on the emitted JSONL line and on notification calls (notifier mocked).

1. **Memory: emits one JSONL line per invocation** — given any environment, the memory check appends exactly one well-formed JSON object.
2. **Memory: `status=ok` when `pressure=normal`** — regardless of swap.
3. **Memory: `status=critical` only when pressure is critical AND swap is trending up by the strict rule** — covers the "swap non-zero but stable → no critical" boundary. Also asserts `pressure=critical` with stable swap maps to `warn`, not `critical`.
4. **Memory: notification fires on `ok → critical` transition** — prior log entry `ok`, current `critical` → one notification call.
5. **Memory: notification does NOT fire on `critical → critical`** — prior log entry `critical`, current `critical` → zero notification calls.
6. **Disk: `status` thresholds at 15% and 5%** — boundary tests at 14%, 15%, 4%, 5%.
7. **Disk: notification fires on `ok → warn` and on `warn → critical`** — two separate transition tests.
8. **Disk: notification does NOT fire on `warn → warn` or `critical → critical`**.
9. **Leftovers: never invokes the notifier** — under any synthetic input.
10. **Leftovers: never modifies the inspected directories** — assert directory mtimes unchanged across a run.
11. **Log writing: appends, does not truncate** — two consecutive runs leave two lines.
12. **Log writing: creates log directory on first run when absent**.
13. **Notification policy: first-ever run with bad state still notifies** — empty log + current `critical` → one notification (prior state treated as `ok`).
14. **Notification policy: notifier failure does not prevent log line write** — notifier mock returns non-zero; log line still appears.
15. **Install script refuses if `terminal-notifier` is missing on `PATH`**.

## Done criteria

- All three checks behave per the rules above and pass all listed tests.
- The log file format is stable: one JSONL line per check invocation, parseable by `jq`.
- `install.sh` loads both LaunchAgents and drops the `newsyslog` config, refusing cleanly if `terminal-notifier` is missing.
- `uninstall.sh` removes both LaunchAgents.
- `tools/mac-health/README.md` documents install, uninstall, log location, threshold values, and how to inspect the log with `tail` / `jq`.
- `docs/log.md` has a one-line landing entry.
