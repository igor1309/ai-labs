---
date: 2026-02-28
model: claude-opus-4-6
description: "Potential concerns identified during CI and release process review"
---

# CI & Release Process — Review Concerns

## ~~Inline Deploy Scripts~~ (resolved)

Resolved: deploy logic extracted to `nomos/scripts/deploy-staging.sh`, `deploy-prod.sh`, and `rollback-prod.sh`. Scripts are SCP'd to VPS and called from `release-unit.yml`. Verify-version and smoke-test steps remain inline (short, env-var-driven).

## ~~No Rollback Automation~~ (resolved)

Resolved: prod deploy now tags the running image as `nomos:rollback` before replacing it. A `if: failure()` step at the end of the prod job restores the previous image when health check, version verification, or smoke test fails.

## ~~Legacy `release.yml` Drift Risk~~ (deferred)

Deferred: resolves naturally when Oracle migrates to per-unit releases — `release.yml` gets retired at that point. Until then, the legacy workflow is the only Oracle release path and must stay.

## ~~Loki and Oracle Not Yet Release Units~~ (acknowledged)

Loki is on hold. Oracle migration to per-unit releases is TBD. Only Nomos is an active release unit. No action needed until these projects resume or grow beyond the legacy pipeline.

## ~~Single VPS Deployment Target~~ (accepted)

Accepted: single-VPS deployment is appropriate for current scale. Blue/green requires a second host or orchestration — overkill for a low-traffic proxy. The highest-value mitigation is rollback automation (see "No Rollback Automation" above), not additional infrastructure. Zero-downtime restart via Docker health-check readiness is a possible future improvement but not urgent.

## ~~Health Poll Busy Loop~~ (invalid)

Invalid: the actual code uses a single `sleep 5` + one health check (`release-unit.yml:125-126`, `187-188`), not a polling loop. No issue exists.

## ~~Telegram Notification Inconsistency~~ (resolved)

Resolved: `release.yml` notify job replaced with reusable `notify-telegram-failure.yml`, matching `ci.yml` and `release-unit.yml`.

## ~~No Scheduled CI~~ (resolved)

Resolved: `scheduled-health.yml` runs daily at 06:00 UTC — checks Nomos staging/prod health endpoints and runs an LLM smoke test through the prod proxy. Telegram notification on failure.
