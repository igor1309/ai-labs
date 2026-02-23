---
date: 2026-02-23
model: gpt-5.2
description: "Phase 6: enforce Docker Compose logging labels in CI and document onboarding allowlist workflow."
---

# Phase 6: Project onboarding rules and CI enforcement

## Goal
Enforce Compose logging labels and bounded label values for `project` and `service`.

## Artifacts
- CI/runtime checker script:
  - `loki/scripts/phase6/check-compose-labels.js`
- Allowlist source of truth:
  - `loki/docs/onboarding/label-allowlists.yml`
- Onboarding checklist:
  - `loki/docs/onboarding/service-onboarding-checklist.md`

## What the checker enforces
For every file matching:
- `docker-compose*.yml`
- `docker-compose*.yaml`
- `compose*.yml`
- `compose*.yaml`

For every Compose service in those manifests:
- required labels exist:
  - `com.logging.project`
  - `com.logging.service`
- `com.logging.project` is in allowlist `projects`
- `com.logging.service` is in allowlist `services[project]`

## Local verification
Run compliance check:
- `node loki/scripts/phase6/check-compose-labels.js`

Run full tests:
- `./scripts/run_silent.sh "tests" npm test`

## CI behavior
The CI path filter now includes `loki/**`, and the compliance check runs in CI through the Loki test suite.

