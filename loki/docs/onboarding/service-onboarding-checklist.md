---
date: 2026-02-23
model: gpt-5.2
description: "Phase 6 onboarding checklist for project/service labels, allowlist updates, and CI compliance."
---

# Service onboarding checklist

## Goal
Onboard services without label drift, while keeping Loki label cardinality bounded and CI-enforced.

## Required labels (Docker Compose)
Every service in every Compose manifest of an onboarded project must define both labels. A project is onboarded when the allowlist's `projects` names it; the check reads the Compose manifests under the top-level folder of that name, and no others:
- `com.logging.project`
- `com.logging.service`

## systemd naming rule
For host services collected from journald, unit names must follow:
- `<project>__<service>@<instance>.service`

Rules:
- `__` is a reserved delimiter and must not appear inside `<project>` or `<service>`.
- `@<instance>` is mandatory even for single-instance services.

## Bounds and allowlist rules
- `project`: must be in allowlist.
- `service`: must be in allowlist for the selected `project`.
- `level`: bounded set (`debug`, `info`, `warn`, `error`) from central derivation.
- `model`: allowlist per `project`.
- `function`: bounded set per `project/service` (target O(10-50)).

Single source of truth:
- `loki/docs/onboarding/label-allowlists.yml`

## Change process for new project/service values
1. Update `loki/docs/onboarding/label-allowlists.yml` in the same PR.
2. Add/update Compose labels in affected manifests.
3. Run:
   - `node loki/scripts/phase6/check-compose-labels.js`
4. Run full repo tests:
   - `./scripts/run_silent.sh "tests" npm test`

## CI enforcement
CI executes the Compose label compliance check via test coverage and fails when:
- required labels are missing
- `com.logging.project` value is not allowlisted
- `com.logging.service` value is not allowlisted for the selected project

