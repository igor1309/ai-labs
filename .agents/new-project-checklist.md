---
date: 2026-06-02
model: claude-opus-4-8
description: "Checklist to run when a top-level project directory is added, renamed, or removed"
---

# New Project Checklist

When a new top-level project directory is added (or an existing one is renamed/removed), update all of the following in the same change set:

- `scripts/loc-dashboard.sh`: add the project to the `ROW PROJECTS` header comment, the per-project `for proj in ...` loop, and the `known` list in `check_project_drift`.
- `README.md` `## Components` table: add a row with type and one-line description.
- `docs/loc-dashboard.html`: add a `product reveal` card under `## Components` and a corresponding entry in the `data` array used by the chart.
- `<project>/docs/log.md`: seed a project log with an initial entry (project established, scope, initial artifacts).
- `docs/log.md`: add a top-level entry summarizing the landing.
- `release-units.config.toml` (only if the project ships a release unit).
- Per-project CI workflow (`<project>-core.yml`) per the "Per-Project CI Isolation" section, only if the project has tests/build to run.
