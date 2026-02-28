---
date: 2026-02-28
model: claude-opus-4-6
description: "Potential concerns identified during CI and release process review"
---

# CI & Release Process — Review Concerns

## Inline Deploy Scripts

Nomos staging and prod deploy jobs contain ~40 lines of inline shell each (SCP, docker build, health polling, smoke tests). This is fragile and hard to test locally. Consider extracting to a deploy script checked into the repo.

## No Rollback Automation

If prod smoke fails after `docker compose up`, there is no automatic rollback to the previous version. The pipeline fails and notifies, but the broken version stays running.

## Legacy `release.yml` Drift Risk

Oracle's legacy pipeline (`release.yml`, triggered by `v*` tags) runs the same tests but uses a different job structure than `release-unit.yml`. When Oracle migrates to per-unit releases, the legacy workflow should be retired to avoid confusion.

## Loki and Oracle Not Yet Release Units

`release-units.config.toml` declares all three paths (`loki`, `nomos`, `oracle`), but only Nomos has a canonical metadata file. Loki and Oracle releases are manual or legacy-only.

## Single VPS Deployment Target

Nomos deploys to one VPS via SSH. No blue/green, no canary. The staging-to-prod promotion mitigates risk, but a failed prod deploy could cause downtime.

## Health Poll Busy Loop

Staging and prod health checks use `sleep 2` in a loop (up to 30 iterations). This works but is noisy in CI logs.

## Telegram Notification Inconsistency

`release.yml` uses inline notification logic while `release-unit.yml` and `ci.yml` use the reusable `notify-telegram-failure.yml`. Could be unified.

## ~~No Scheduled CI~~ (resolved)

Resolved: `scheduled-health.yml` runs daily at 06:00 UTC — checks Nomos staging/prod health endpoints and runs an LLM smoke test through the prod proxy. Telegram notification on failure.
