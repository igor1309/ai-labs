---
date: 2026-02-28
model: claude-opus-4-6
description: "Potential concerns identified during CI and release process review"
---

# CI & Release Process — Review Concerns

## Legacy `release.yml` Drift Risk (deferred)

Deferred: resolves naturally when Oracle migrates to per-unit releases — `release.yml` gets retired at that point. Until then, the legacy workflow is the only Oracle release path and must stay.

## Loki and Oracle Not Yet Release Units (acknowledged)

Loki is on hold. Oracle migration to per-unit releases is TBD. Only Nomos is an active release unit. No action needed until these projects resume or grow beyond the legacy pipeline.

## Single VPS Deployment Target (accepted)

Accepted: single-VPS deployment is appropriate for current scale. Blue/green requires a second host or orchestration — overkill for a low-traffic proxy. The highest-value mitigation is rollback automation (now implemented), not additional infrastructure. Zero-downtime restart via Docker health-check readiness is a possible future improvement but not urgent.
