---
date: 2026-06-02
model: claude-opus-4-8
description: "Per-project CI isolation rules — dedicated workflows, no cross-project deps (read when adding a project with its own dependencies)"
---

# Per-Project CI Isolation

When adding a new project with its own dependencies, create a dedicated `<project>-core.yml` CI workflow. Do not modify another project's workflow to install cross-project deps or run cross-project tests.

- Each `<project>-core.yml` installs only its own deps and runs only its own test glob.
- `ci.yml` dispatches to per-project workflows based on path-filter change detection; together the per-project workflows cover all tests from all projects.
- The release pipeline (`release.yml`) installs all deps, runs the full `npm test` suite, and adds e2e tests on top.
- When a new project causes failures in repo-wide tests (e.g. label compliance scanning all compose files), the fix is legitimate but must be called out explicitly as a cross-project integration concern — not silently bundled into the project's commit.
