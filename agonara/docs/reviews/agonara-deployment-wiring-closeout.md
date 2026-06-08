---
date: 2026-06-07
model: gpt-5
description: "Agonara deployment wiring closeout evidence"
---

# Agonara Deployment Wiring Closeout

## Scope

This closes `agonara/docs/plans/agonara-deployment-wiring.md` after the
deployment wiring had already landed and the first Agonara release had already
run.

## Release Evidence

- Tag: `agonara_v0.1.0`
- Tag commit: `1a69462bdcd3f529d82753aa22eb7d463a54b858`
- Tagged merge: `Merge pull request #508 from igor1309/codex/agonara-adr018-runtime`
- GitHub Actions run:
  [27073521933](https://github.com/igor1309/ai-labs/actions/runs/27073521933)
- GitHub Release:
  [agonara v0.1.0](https://github.com/igor1309/ai-labs/releases/tag/agonara_v0.1.0)

Key release-unit jobs:

| Job | Result |
| --- | --- |
| `verify` | success |
| `core` | success |
| `deploy-agonara-staging` | success |
| `deploy-agonara-prod` | success |
| `github-release` | success |
| `notify` | skipped because the deploy/release path succeeded |

## Readiness Script Behavior

The first-release readiness script now blocks reuse of the completed first tag:

```text
ERROR: release tag already exists: agonara_v0.1.0
```

That is the expected post-release behavior. Earlier release-readiness,
secret-provisioning, deployment, backup/restore, and first-release execution
work is recorded in `agonara/docs/log.md` and the repo `docs/log.md`.

## Static Evidence

The implementation artifacts required by the plan are present:

- `release-units.config.toml` discovers `agonara`.
- `release-units.toml` contains `basename = "agonara"`, `path = "agonara"`,
  and Docker release metadata.
- `.github/workflows/release-unit.yml` contains `deploy-agonara-staging`,
  `deploy-agonara-prod`, Agonara deploy failure fan-in, and Agonara GitHub
  Release gating.
- `agonara/compose.staging.yml` and `agonara/compose.prod.yml` define isolated
  staging/prod projects, containers, loopback ports, and data volumes.
- `agonara/scripts/deploy-staging.sh`, `deploy-prod.sh`, `rollback-prod.sh`,
  `backup-staging.sh`, `restore-staging.sh`, `backup-prod.sh`, and
  `restore-prod.sh` exist.
- `scripts/release/check-agonara-release-readiness.js` enforces the release,
  workflow, deploy, rollback, backup, restore, and smoke invariants.

## Closeout Verification

Commands run for this closeout:

- `gh run list --repo igor1309/ai-labs --workflow release-unit.yml --limit 10 --json databaseId,displayTitle,event,headBranch,headSha,status,conclusion,createdAt,url`
- `gh run view 27073521933 --repo igor1309/ai-labs --json jobs`
- `gh release view agonara_v0.1.0 --repo igor1309/ai-labs --json tagName,name,isDraft,isPrerelease,publishedAt,url,targetCommitish`
- `git show --no-patch --decorate --oneline agonara_v0.1.0`

Final local gates for this archive-only closeout are recorded in the commit that
moves the plan.
