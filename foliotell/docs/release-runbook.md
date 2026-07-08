---
date: 2026-07-08
model: claude-fable-5
description: "Step-by-step FolioTell release runbook — exact commands, gates, caveats, and recovery for cutting a TestFlight release without re-deriving context"
---

# FolioTell Release Runbook

Self-contained procedure for releasing FolioTell to TestFlight. Written so an
agent with repo access and no prior context can execute it. Repo-wide
invariants live in `.agents/release-process.md` and the `release-process`
skill; this runbook is the FolioTell-specific execution order.

## Preconditions

- All code changes for the release are already merged to `trunk` (the release
  PR contains only the version bump, manifest, and log entries).
- Working tree clean, on `trunk`, up to date: `git checkout trunk && git pull --ff-only`.
- No `foliotell_v<new-version>` tag exists locally or on origin.

## Release Steps

### 1. Branch and bump

```bash
git checkout -b <agent>/release-foliotell-<version> trunk
sed -i '' 's/version = "<old>"/version = "<new>"/' foliotell/release.toml
node scripts/release/generate-manifest.js
node scripts/release/validate-manifest.js
node scripts/release/generate-manifest.js --check
```

SemVer: patch for fixes, minor for features (pre-1.0 discipline per repo
convention).

### 2. Log entries

Add exactly one new entry at the top of the current date section in **both**
`docs/log.md` (prefixed `FolioTell:`) and `foliotell/docs/log.md`, scoped to
the released delta.

### 3. Gates

```bash
./scripts/run_silent.sh "build" npx tsc --noEmit
./scripts/run_silent.sh "tests" npm test
```

The full root suite is the gate — the release workflow re-runs it, so a
failure in any unit blocks this release. Swift gates (`swift build` /
`swift test` in `foliotell/`) are required only if Swift code changed since
they last ran green.

### 4. PR

```bash
git add foliotell/release.toml release-units.toml docs/log.md foliotell/docs/log.md
git commit -m "release foliotell <version>"
git push -u origin <branch>
gh pr create --title "Release FolioTell <version>" --body "<summary + verification>"
gh pr merge <pr> --merge --auto --delete-branch
./scripts/watch-pr.sh <pr>
```

Merge commit, never squash. `trunk` is protected — no direct pushes.

If enabling auto-merge fails (or shows `automerge: none`) because checks are
already green and the PR is CLEAN, merge directly:
`gh pr merge <pr> --merge --delete-branch`. If the PR reports BEHIND, run
`gh pr update-branch <pr>` and wait for checks again.

To delegate execution to a cheap agent, use the `release-executor` subagent
(`.claude/agents/release-executor.md`); pass unit, versions, branch name, log
entries, and PR title/body in the invocation prompt.

### 5. Tag and watch

```bash
git checkout trunk && git pull --ff-only
git tag foliotell_v<version>
git push origin foliotell_v<version>   # never git push --tags
gh run list --workflow "Release Unit" --limit 1   # grab the run id
gh run watch <run-id> --exit-status
```

### 6. Verify

All four jobs must conclude `success` (the rest are skipped for foliotell):

```bash
gh run view <run-id> --json conclusion,jobs \
  --jq '.conclusion, (.jobs[] | select(.conclusion != "skipped") | [.name, .conclusion] | @tsv)'
```

Expected: `verify`, `test-foliotell`, `deploy-foliotell-testflight`,
`github-release`. For extra confidence, the deploy job log contains
`UPLOAD SUCCEEDED` with a `Delivery UUID`.

TestFlight then processes the build for minutes before internal testers see
it; no action needed.

## Caveats

- **Runner Xcode variance.** `macos-latest` images carry different default
  Xcodes (16.x vs 26.x observed within one week in 2026-07). The deploy job
  has a "Select newest Xcode" step so the shipped SDK and the `altool`
  generation do not depend on runner luck. Do not remove it.
- **altool flags.** `foliotell/scripts/distribute-testflight.sh` must use only
  the documented interface: `-t ios --apiKey <id> --apiIssuer <issuer>` with
  the key at `~/.appstoreconnect/private_keys/AuthKey_<id>.p8`. The
  undocumented spellings (`--api-key`, `--p8-file-path`, `--team-id`) are
  accepted only by the Xcode 26.x ContentDelivery altool and broke the first
  `foliotell_v0.0.3` run on an Xcode 16.4 runner.
- **Team pinning.** Apple team/provider is hard-pinned to `VRVJ9YNRQU` by
  `require_exact_team`, `DEVELOPMENT_TEAM`, and the export options plist —
  not by an altool flag.
- **Archive signing.** The TestFlight archive command must pass
  `CODE_SIGNING_ALLOWED=NO`; distribution signing belongs to the later
  `xcodebuild -exportArchive` step. Signing during `archive` has failed both
  ways in CI: the target's automatic settings request development assets by
  default, while forcing `CODE_SIGN_IDENTITY="Apple Distribution"` conflicts
  with automatic development signing before export can run.
- **Build number** is the workflow `run_number`, so TestFlight build numbers
  are not contiguous across releases. Marketing version comes from
  `release.toml` via the `verify` job.
- **Secrets** live in the `testflight` GitHub environment:
  `FOLIOTELL_ASC_API_KEY_ID`, `FOLIOTELL_ASC_API_ISSUER_ID`,
  `FOLIOTELL_ASC_API_PRIVATE_KEY`.

## Recovery: failed release run

For foliotell, `deploy-foliotell-testflight` gates `github-release`; if the
deploy fails, nothing was uploaded and no GitHub release exists, so
re-pointing the tag is safe:

```bash
git tag -d foliotell_v<version>
git push origin :refs/tags/foliotell_v<version>
# land the fix on trunk via PR, then re-run steps 5-6 at the new trunk HEAD
```

## Stop Conditions

Stop and escalate instead of retrying when:

- any test or gate fails for reasons unrelated to the release delta;
- the deploy job fails with an error not covered in Caveats;
- the tag already exists remotely at a different commit.
