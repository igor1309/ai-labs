---
date: 2026-09-16
model: claude-sonnet-5
description: "Repo-specific release process details — config, CI triggers, gates, definition of done, and legacy coexistence (read when doing release work)"
---

# Release Process

Repo-specific addenda to the `release-process` skill. Read when doing release work.

- Governed by ADR-000 through ADR-006 (`docs/adr/release/`).
- Config: `release-units.config.toml`; manifest: `release-units.toml`; generator: `scripts/release/generate-manifest.js`.
- CI trigger: `.github/workflows/release-unit.yml`. Release detection: `detect-releases.js`; tag creation: `create-tags.js`.
- Pre-push gate for Node/TypeScript: `./scripts/run_silent.sh "tests" npm test` and `./scripts/run_silent.sh "typecheck" npm run typecheck`. **`npm test` is the full root suite, and that is the gate** — the release-unit `core` job re-runs the same full suite, so a pre-existing failure in *any* unit blocks *every* unit's release. Trunk being green is not sufficient: per-project CI path filters skip the full suite, so a failure can hide on trunk and only surface in the release run. If the full suite is red, the release is blocked until it is green — never substitute `npm run test:<unit>` for the gate.
- Smoke model: `vars.OPENROUTER_CI_MODEL` and `secrets.OPENROUTER_API_KEY`.
- Legacy coexistence: the existing `v*` tag namespace (`.github/workflows/release.yml`, Oracle-specific) coexists with the new `<basename>_v*` namespace. The legacy workflow is not modified; migration is deferred.
- Release-candidate transition: a feature branch may, but does not have to,
  transition in place to release-candidate state once its complete product
  scope is ready. Sync it with the latest `trunk`, freeze product changes,
  then add the version bump, generated manifest, release notes, and logs.
  The resulting PR may contain the already-reviewed product diff plus those
  release metadata changes. After the transition, do not add product changes;
  merge the candidate to `trunk` before tagging.
- Delegation: routine releases with a self-contained unit runbook (e.g.
  `foliotell/ios/docs/release-runbook.md`) can be executed by the `release-executor`
  subagent (`.claude/agents/release-executor.md`, haiku model) — pass unit,
  versions, branch name, log entries, and PR title/body in the invocation
  prompt; it stops and reports on anything off-runbook.

## Definition of done

The `release-process` skill's "Completion verification" checklist applies. Repo-specific additions:

- Full root suite green before tagging (see the pre-push gate above) — not the per-unit subset.
- Agonara only: before pushing an `agonara_v<version>` tag, the Agonara
  readiness gate must pass: `node scripts/release/check-agonara-release-readiness.js --tag agonara_v<version>`.
  Add `--check-github-secrets` to verify deploy-secret names without reading
  their values. This script rejects every non-Agonara tag by design; do not run
  it for FolioTell or another release unit.
- Tag points at the release-candidate merge commit on `trunk` (the release-unit
  `verify` job rejects a tag not reachable from `origin/trunk`).
- After tag push, the unit's applicable `release-unit.yml` jobs are green.
  Agonara additionally requires its deployed `/operations/health` to report
  the released version. FolioTell instead requires `verify`, `test-foliotell`,
  `deploy-foliotell-testflight`, and `github-release` to succeed, as its
  runbook specifies.

## Recovery: re-pointing a tag after a failed run

The `core` job gates the deploy jobs, so a failure there means nothing deployed and no GitHub release was created. To recover:

1. Delete the tag locally and on the remote: `git tag -d <tag>` then `git push origin :refs/tags/<tag>`.
2. Land the fix on `trunk` via PR.
3. Re-run the readiness gate (it requires the tag to be absent), then re-create the tag at the new `trunk` HEAD and push it — this re-triggers `release-unit.yml`.
