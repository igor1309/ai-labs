---
date: 2026-04-24
model: claude-opus-4-6
description: "CI/CD architecture overview for the ai-labs monorepo"
---

# CI/CD Workflows

Workflows are organized into four categories:

- **Dispatcher** — `ci.yml` routes pushes and PRs to per-project workflows based on changed paths (`dorny/paths-filter`).
- **Per-Project Core** — reusable `workflow_call` workflows (`<project>-core.yml`) that each project owns independently.
- **Release** — tag-triggered pipelines for per-unit and legacy Oracle releases.
- **Scheduled & Independent** — health checks, dashboards, deployments, and housekeeping that run on cron or trunk push.

## Path Filtering Policy

`ci.yml` does **not** use top-level `paths-ignore`. All path filtering happens inside the workflow via `dorny/paths-filter` in the `changes` job, which gates per-project jobs with `if:` conditions.

This ensures the `report` job (a required status check for branch protection) always runs — even on doc-only or non-code changes — while expensive test/build jobs are skipped when their project files are unchanged.

The `report` job is named `report` only on `pull_request` runs (`report (push)` and `report (workflow_dispatch)` otherwise), so the required check is satisfied only by the PR's own run, never by the push run of the same commit.

Per-project workflows do not need their own path filters — the dispatcher's `changes` job already prevents them from running on unrelated changes.

Each project's filter in the `changes` job is an **allowlist of build/test inputs** — source, tests, manifests, lockfiles, and build/deploy descriptors (e.g. `Dockerfile`, `compose`, `Caddyfile`, `wrangler.*`). It deliberately **excludes documentation** (`<project>/docs/**`, `README.md`, `TODO.md`, landing/`*.html`, research notes) so a docs-only change skips the expensive core job while the required `report` check still runs. Do **not** use a blanket `<project>/**` glob: it pulls `docs/**` into the trigger set and runs the full core pipeline (tests, and for some projects a Docker build + container smoke) on documentation edits. When adding a project, list its code paths explicitly, as `clipdeck` and `agonara` do.

## Notio Split

Notio has separate backend and frontend release units:

- `notio-core.yml` runs Swift tests from `notio/backend/`.
- `notio-frontend-core.yml` runs the frontend typecheck, tests, and build from `notio/frontend/`.
- `release-unit.yml` deploys `notio-backend_v<version>` tags to the VPS Docker service.
- `notio-frontend-deploy.yml` is release-only and reusable; `release-unit.yml` calls it for `notio-frontend_v<version>` tags after the frontend core gate. A Notio frontend release succeeds only after the production Cloudflare Pages app renders the expected `Version` text in the browser-rendered page-version smoke check.

There is no trunk-push Cloudflare Pages deploy path for Notio frontend.

## Shared Infrastructure

- **Path detection**: `dorny/paths-filter@v4` in the `changes` job
- **Failure notifications**: all pipelines route failures through `notify-telegram-failure.yml`
- **Concurrency**: scheduled workflows use `concurrency` groups to prevent overlap
- **Timezone**: all cron schedules target Moscow morning (UTC+3), documented in each file
