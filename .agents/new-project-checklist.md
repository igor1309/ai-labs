---
date: 2026-06-23
model: claude-opus-4-8
description: "Checklist to run when a top-level directory is added, renamed, or removed"
---

# New Project Checklist

When a new top-level directory is added (or an existing one is renamed/removed), classify it so drift checks stay green.

**Any** new top-level dir — even a non-project one (e.g. `backlog/`, a docs or research dir) — needs at minimum the `loc-dashboard.sh` `known`-list entry below. A **project** dir (ships code/artifacts) needs every item, all in the same change set:

- `scripts/loc-dashboard.sh`: add the dir to the `known` list in `check_project_drift`. **Required for any new top-level dir** — an unclassified dir fails the drift test, which the release-unit `core` job runs as part of the full root suite, so it blocks *every* release until fixed. For a **project** that should appear as a dashboard row, also add it to the `ROW PROJECTS` header comment and the per-project `for proj in ...` loop.
- `README.md` `## Components` table: add a row with type and one-line description.
- `docs/loc-dashboard.html`: add a `product reveal` card under `## Components` and a corresponding entry in the `data` array used by the chart.
- `<project>/docs/log.md`: seed a project log with an initial entry (project established, scope, initial artifacts).
- `docs/log.md`: add a top-level entry summarizing the landing.
- `release-units.config.toml` (only if the project ships a release unit).
- Per-project CI workflow (`<project>-core.yml`) per the "Per-Project CI Isolation" section, only if the project has tests/build to run.
