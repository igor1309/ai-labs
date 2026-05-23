# Log

## 2026-05-23

- Checks runtime implemented: `lib/common.sh` (log path, JSONL append, prior-status lookup, trend-sample extractor, best-effort notifier wrapper) and three check scripts (`check-memory.sh`, `check-disk.sh`, `check-leftovers.sh`). Test suite under `tests/` covers spec rules 1–14 across 25 cases with sandboxed PATH mocks for `memory_pressure`, `sysctl`, `df`, `du`, and `terminal-notifier`. Adversarial review added 4 tests for gaps: disk `ok→critical` direct transition, warn-vs-critical title differentiation, and notification body content (per spec rules 5 and 6). Deferred: `install.sh`/`uninstall.sh` (covers spec test 15), launchd plists, `newsyslog` config, `README.md`.
- Tool established under `tools/mac-health/`. Initial doc set: intent, ADR-001, spec (v0.1). Scope: scheduled launchd-driven macOS health checks (memory, disk, leftovers) with JSONL log and threshold-crossing notifications via `terminal-notifier`. Run-from-repo (no `~/bin` copy or symlink). Not an ai-labs project — no CI workflow, no release unit, no `## Components` row, no `loc-dashboard` entry.
