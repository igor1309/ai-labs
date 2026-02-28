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

## ~~Single VPS Deployment Target~~ (accepted)

Accepted: single-VPS deployment is appropriate for current scale. Blue/green requires a second host or orchestration — overkill for a low-traffic proxy. The highest-value mitigation is rollback automation (see "No Rollback Automation" above), not additional infrastructure. Zero-downtime restart via Docker health-check readiness is a possible future improvement but not urgent.

## ~~Health Poll Busy Loop~~ (invalid)

Invalid: the actual code uses a single `sleep 5` + one health check (`release-unit.yml:125-126`, `187-188`), not a polling loop. No issue exists.

## ~~Telegram Notification Inconsistency~~ (resolved)

Resolved: `release.yml` notify job replaced with reusable `notify-telegram-failure.yml`, matching `ci.yml` and `release-unit.yml`.

## ~~No Scheduled CI~~ (resolved)

Resolved: `scheduled-health.yml` runs daily at 06:00 UTC — checks Nomos staging/prod health endpoints and runs an LLM smoke test through the prod proxy. Telegram notification on failure.
