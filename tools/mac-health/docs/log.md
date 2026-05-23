# Log

## 2026-05-23

- Tool established under `tools/mac-health/`. Initial doc set: intent, ADR-001, spec (v0.1). Scope: scheduled launchd-driven macOS health checks (memory, disk, leftovers) with JSONL log and threshold-crossing notifications via `terminal-notifier`. Run-from-repo (no `~/bin` copy or symlink). Not an ai-labs project — no CI workflow, no release unit, no `## Components` row, no `loc-dashboard` entry. Implementation (scripts, plists, newsyslog config, install/uninstall) not yet authored.
