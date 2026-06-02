---
date: 2026-06-02
model: claude-opus-4-8
description: "Repo-specific release process details — config, CI triggers, gates, and legacy coexistence (read when doing release work)"
---

# Release Process

Repo-specific addenda to the `release-process` skill. Read when doing release work.

- Governed by ADR-000 through ADR-006 (`docs/adr/release/`).
- Config: `release-units.config.toml`; manifest: `release-units.toml`; generator: `scripts/release/generate-manifest.js`.
- CI trigger: `.github/workflows/release-unit.yml`. Release detection: `detect-releases.js`; tag creation: `create-tags.js`.
- Pre-push gate for Node/TypeScript: `./scripts/run_silent.sh "build" npx tsc --noEmit` and `./scripts/run_silent.sh "tests" npm test`.
- Smoke model: `vars.OPENROUTER_CI_MODEL` and `secrets.OPENROUTER_API_KEY`.
- Legacy coexistence: the existing `v*` tag namespace (`.github/workflows/release.yml`, Oracle-specific) coexists with the new `<basename>_v*` namespace. The legacy workflow is not modified; migration is deferred.
