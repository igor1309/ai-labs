---
date: 2026-04-20
model: claude-opus-4-6
description: "CI/CD architecture overview for the ai-labs monorepo"
---

# CI/CD Workflows

Workflows are organized into four categories:

- **Dispatcher** — `ci.yml` routes pushes and PRs to per-project workflows based on changed paths (`dorny/paths-filter`).
- **Per-Project Core** — reusable `workflow_call` workflows (`<project>-core.yml`) that each project owns independently.
- **Release** — tag-triggered pipelines for per-unit and legacy Oracle releases.
- **Scheduled & Independent** — health checks, dashboards, deployments, and housekeeping that run on cron or trunk push.

## Paths-Ignore Policy

`ci.yml` uses `paths-ignore` to skip CI for non-code directories — e.g., `docs/**`, `sandbox/**`, `.claude/**`, `tools/**`. See the `paths-ignore` block in `ci.yml` for the authoritative list.

Per-project workflows do not need their own paths-ignore — the dispatcher's path-filter routing already prevents them from running on unrelated changes.

Currently `sandbox/` and `research/` skip CI entirely. In the future, specialized workflows may run for them — e.g., LinkedIn content checks, frontmatter validation, link checking. When that happens, remove the relevant `paths-ignore` entries and add proper path filters instead.

## Shared Infrastructure

- **Path detection**: `dorny/paths-filter@v3` in the `changes` job
- **Failure notifications**: all pipelines route failures through `notify-telegram-failure.yml`
- **Concurrency**: scheduled workflows use `concurrency` groups to prevent overlap
- **Timezone**: all cron schedules target Moscow morning (UTC+3), documented in each file
