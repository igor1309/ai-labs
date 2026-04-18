---
date: 2026-04-18
model: claude-opus-4-6
description: "Known pitfalls and gotchas for the notio project"
---

# notio — Gotchas

## SwiftPM: test target source discovery requires Tests/ directory

SwiftPM 6.1 requires the `Tests/<TargetName>/` directory to exist even when building a specific product (`--product NotioServer`). If the directory is missing, SwiftPM falls back to scanning `Sources/` for the test target and reports "overlapping sources." Reproduces on both macOS and Linux.

This means `Tests/` must survive the full deploy path: SCP source list (`release-unit.yml`) → deploy script (`scripts/deploy.sh`) → `.dockerignore` → Dockerfile `COPY . .`.

**Rule:** never exclude `Tests/` from any layer of the deploy pipeline.

## Deploy script: stale directories on VPS

The deploy script (`scripts/deploy.sh`) copies fresh `Sources/` and `scripts/` to `/opt/notio/` but must also clean any directories that are no longer shipped. If a directory was previously deployed and is later removed from the SCP source list, it persists on the VPS and gets picked up by `COPY . .` in the Dockerfile.

**Rule:** when removing a directory from the SCP source list in `release-unit.yml`, add a corresponding `rm -rf` to `deploy.sh`.

## Swift stdout buffering in Docker

`print()` buffers stdout in release builds. Docker captures stdout/stderr but buffered output from short-lived request handlers never flushes — logs silently disappear. Swift 6.1 strict concurrency also rejects `stderr`/`stdout` globals as non-sendable.

**Rule:** use `write(STDERR_FILENO, ...)` for log output. `STDERR_FILENO` is an `Int32` constant (concurrency-safe) and stderr is unbuffered.
