# mac-health

Scheduled, low-footprint macOS health monitor. Three short-lived shell checks
run on `launchd` cadences, append one JSONL line per run to a `newsyslog`-rotated
log, and fire macOS notifications via `terminal-notifier` only on threshold
crossings. No resident process, no menu-bar UI.

See `docs/intent.md`, `docs/adr.md`, `docs/spec.md` for the full design.

## Scope

| Check     | Cadence | Surfaces                                                                                  |
| --------- | ------- | ----------------------------------------------------------------------------------------- |
| Memory    | 5 min   | `memory_pressure` level + `vm.swapusage`, with a swap-growth trend rule                   |
| Disk      | 30 min  | `df` for `/` — free GB and free %                                                         |
| Leftovers | 30 min  | Sizes for DerivedData, Simulator Caches, `~/Library/Caches`, Homebrew downloads, old Trash |

Leftovers is **report-only** by design — it never deletes or modifies files.

## Install

Requires `terminal-notifier` on `PATH`. Install it first:

```sh
brew install terminal-notifier
```

Then run the installer from the repo:

```sh
./tools/mac-health/install.sh
```

The installer:

- Refuses if `terminal-notifier` is not on `PATH`.
- Writes substituted `LaunchAgent` plists to `~/Library/LaunchAgents/`.
- Loads them via `launchctl bootstrap gui/<uid>`.
- Drops `/etc/newsyslog.d/mac-health.conf` (requires `sudo`) to rotate the log
  at 1 MB with 5 gzipped archives.

Scripts run **directly from the repo path** — there is no copy step. Moving
or deleting the ai-labs checkout will break mac-health until reinstall.

## Uninstall

```sh
./tools/mac-health/uninstall.sh
```

Removes the LaunchAgents. Pass `--remove-newsyslog` to also remove the
newsyslog config:

```sh
./tools/mac-health/uninstall.sh --remove-newsyslog
```

## Log

- Path: `~/Library/Logs/mac-health/health.log`
- Format: JSONL — one line per check invocation.
- Rotation: `newsyslog` at 1 MB, 5 gzipped archives.

Inspect with ordinary terminal tools:

```sh
# Tail latest entries.
tail -f ~/Library/Logs/mac-health/health.log

# Pretty-print the last 10 lines.
tail -n 10 ~/Library/Logs/mac-health/health.log | jq .

# Last memory check.
grep '"check":"memory"' ~/Library/Logs/mac-health/health.log | tail -n 1 | jq .

# Distribution of disk statuses today.
jq -r '.check + " " + .status' ~/Library/Logs/mac-health/health.log | sort | uniq -c
```

## Thresholds

| Check  | Field               | `ok`     | `warn`           | `critical`                                                              |
| ------ | ------------------- | -------- | ---------------- | ----------------------------------------------------------------------- |
| Disk   | free %              | `>= 15`  | `>= 5` & `< 15`  | `< 5`                                                                   |
| Memory | `memory_pressure`   | `normal` | `warn`           | `critical` AND swap trending up (last 6 samples non-decreasing, current > oldest, current > 1024 MB) |

Notifications fire only on threshold crossings:

- Disk: on `ok→warn`, `ok→critical`, and `warn→critical`.
- Memory: on `*→critical` only (never re-notifies while still critical).
- Leftovers: never notifies.

To tune thresholds, edit the constants in `checks/check-disk.sh` and
`checks/check-memory.sh` and re-run the installer.

## Layout

```
tools/mac-health/
├── README.md
├── install.sh
├── uninstall.sh
├── checks/
│   ├── check-memory.sh
│   ├── check-disk.sh
│   ├── check-leftovers.sh
│   └── check-disk-and-leftovers.sh    # wrapper for the disk-leftovers LaunchAgent
├── lib/
│   └── common.sh                       # shared log + notifier helpers
├── launchd/
│   ├── com.user.mac-health.memory.plist
│   └── com.user.mac-health.disk-leftovers.plist
├── newsyslog/
│   └── mac-health.conf                 # 1 MB rotation, 5 gzipped archives
├── tests/                              # shell test suite (27 cases)
│   ├── run-all.sh
│   └── ...
└── docs/
    ├── intent.md
    ├── adr.md
    ├── spec.md
    └── log.md
```

## Tests

```sh
sh tools/mac-health/tests/run-all.sh
```

Tests sandbox `HOME`, override `MAC_HEALTH_LOG_FILE`, and prepend a mock
binary directory to `PATH` so checks run hermetically against synthetic
`memory_pressure`, `sysctl`, `df`, `du`, and `terminal-notifier` outputs.

## Not an ai-labs project

By design, mac-health is host-level personal tooling. It has no CI workflow,
no release unit, no row in the README `## Components` table, and no entry
in `loc-dashboard`.
