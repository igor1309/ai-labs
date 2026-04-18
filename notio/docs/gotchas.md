---
date: 2026-04-18
model: claude-opus-4-6
description: "Known pitfalls and gotchas for the notio project"
---

# notio — Gotchas

## SwiftPM on Linux: test target source discovery

SwiftPM 6.1 on Linux requires the `Tests/<TargetName>/` directory to exist even when building a specific product (`--product NotioServer`). If the directory is missing (e.g. excluded via `.dockerignore`), SwiftPM falls back to scanning `Sources/` for the test target and reports "overlapping sources."

**Rule:** never exclude `Tests/` from the Docker build context.

## Deploy script: stale directories on VPS

The deploy script (`scripts/deploy.sh`) copies fresh `Sources/` and `scripts/` to `/opt/notio/` but must also clean any directories that are no longer shipped. If a directory was previously deployed and is later removed from the SCP source list, it persists on the VPS and gets picked up by `COPY . .` in the Dockerfile.

**Rule:** when removing a directory from the SCP source list in `release-unit.yml`, add a corresponding `rm -rf` to `deploy.sh`.
