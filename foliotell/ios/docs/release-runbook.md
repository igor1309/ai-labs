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

- The complete product scope is ready on a feature branch or on `trunk`.
- Working tree clean, with the candidate synchronized to the latest `trunk`.
- No `foliotell_v<new-version>` tag exists locally or on origin.

## Release Steps

### 1. Transition to release-candidate state

A feature branch may, but does not have to, become the release-candidate
branch. Keeping the existing branch is valid; create a new branch only when a
separate review boundary is useful.

```bash
git fetch origin trunk
git rebase origin/trunk
# Optional: create a separate candidate branch from the complete feature branch.
git switch -c <agent>/release-foliotell-<version>
```

All intended product changes must be committed before the candidate is frozen.
Afterward, do not add product changes. The release PR can contain the complete
reviewed product diff plus the release metadata commit.

### 2. Bump and document

```bash
sed -i '' 's/version = "<old>"/version = "<new>"/' foliotell/ios/release.toml
node scripts/release/generate-manifest.js
node scripts/release/validate-manifest.js
node scripts/release/generate-manifest.js --check
```

Compute the release notes from the previous FolioTell tag to the frozen
candidate tip. This includes every user-facing change in the candidate, not
only the most recent commit.

SemVer: patch for fixes, minor for features (pre-1.0 discipline per repo
convention).

Create `foliotell/ios/docs/releases/<new-version>.md` with YAML front matter, an
exact `# FolioTell <new-version>` title, and a non-empty `## What's New`
section. Its user-facing Markdown, excluding the YAML metadata, becomes the
GitHub Release body.

```bash
node scripts/release/validate-foliotell-release-notes.js
```

### 3. Log entries

Add exactly one new entry at the top of the current date section in **both**
`docs/log.md` (prefixed `FolioTell:`) and `foliotell/docs/log.md`, scoped to
the released delta.

### 4. Gates

```bash
./scripts/run_silent.sh "build" npx tsc --noEmit
./scripts/run_silent.sh "tests" npm test
```

The full root suite is the gate — the release workflow re-runs it, so a
failure in any unit blocks this release. Swift gates (`swift build` /
`swift test` in `foliotell/ios/`) are required only if Swift code changed since
they last ran green.

### 5. PR

```bash
git add foliotell/ios/release.toml release-units.toml foliotell/ios/docs/releases/<version>.md docs/log.md foliotell/docs/log.md
git commit -m "release foliotell <version>"
git push -u origin <candidate-branch>
gh pr create --title "Release FolioTell <version>" --body "<summary + verification>"
gh pr merge <pr> --merge --auto --delete-branch
./scripts/watch-pr.sh <pr>
```

The PR may include the frozen product changes and the release metadata
commit. Merge commit, never squash. `trunk` is protected — no direct pushes.

If enabling auto-merge fails (or shows `automerge: none`) because checks are
already green and the PR is CLEAN, merge directly:
`gh pr merge <pr> --merge --delete-branch`. If the PR reports BEHIND, run
`gh pr update-branch <pr>` and wait for checks again.

To delegate execution to a cheap agent, use the `release-executor` subagent
(`.claude/agents/release-executor.md`); pass unit, versions, branch name, log
entries, and PR title/body in the invocation prompt.

### 6. Tag and watch

```bash
git checkout trunk && git pull --ff-only
git tag foliotell_v<version>
git push origin foliotell_v<version>   # never git push --tags
gh run list --workflow "Release Unit" --limit 1   # grab the run id
gh run watch <run-id> --exit-status
```

### 7. Verify

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

## Why this transition exists

Release metadata does not need to wait for a prior code-only merge. The
candidate branch is the review boundary: it contains the full product delta,
then freezes while the version, manifest, notes, logs, and gates are added.
The final merge to `trunk` preserves trunk-only tagging and deployment while
avoiding a second release-preparation cycle after the product work is already
reviewed.

## Caveats

- **Runner Xcode variance.** `macos-latest` images carry different default
  Xcodes (16.x vs 26.x observed within one week in 2026-07). The deploy job
  has a "Select newest Xcode" step so the shipped SDK and the `altool`
  generation do not depend on runner luck. Do not remove it.
- **altool flags.** `foliotell/ios/scripts/distribute-testflight.sh` must use only
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
