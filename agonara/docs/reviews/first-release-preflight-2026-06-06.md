---
date: 2026-06-06
model: gpt-5
description: "First-release preflight result for Agonara from the current release-readiness branch."
---

# Agonara First-Release Preflight Result

## Scope

This preflight follows the recommended next candidate from the release-readiness/Product Intent gap audit. It checks how far the first-release runbook can proceed from the current branch and records the concrete blockers before `agonara_v0.1.0` can be created.

## Commands Run

- `node scripts/release/check-agonara-release-readiness.js --check-github-secrets`
- `node scripts/release/check-agonara-release-readiness.js --tag agonara_v0.1.0`
- `gh secret list --json name`
- `git tag --list 'agonara_v*'`

## Results

### Readiness script

- **Verdict:** fail.
- **Result:** both readiness-script invocations stopped at the release branch guard.
- **Observed output:** `ERROR: releases are only allowed from trunk (current branch: codex/agonara-adr018-runtime)`.
- **Why:** The runbook requires the first-release readiness script to run from trunk before the tag is pushed. The script enforces that invariant before any deeper release wiring checks.
- **Evidence:** `agonara/docs/deployment-handoff.md:319`; `agonara/docs/deployment-handoff.md:323`; `scripts/release/check-agonara-release-readiness.js:51`.
- **Fix:** Merge this branch to trunk, make the trunk worktree clean, then rerun `node scripts/release/check-agonara-release-readiness.js --check-github-secrets`.

### GitHub deploy secrets

- **Verdict:** fail.
- **Result:** `gh secret list --json name` succeeded and the required Agonara deploy secret names were absent.
- **Missing names:** `AGONARA_VPS_HOST`, `AGONARA_VPS_USER`, `AGONARA_VPS_SSH_KEY`.
- **Why:** The deployment handoff requires these repo secrets before the first release can upload source to agonara-vps. Provider, smoke, bootstrap, and backup secrets stay host-side in tier env files.
- **Evidence:** `agonara/docs/deployment-handoff.md:285`; `scripts/release/check-agonara-release-readiness.js:24`; `scripts/release/check-agonara-release-readiness.js:709`; `scripts/release/check-agonara-release-readiness.js:734`.
- **Fix:** Provision the three repo secrets with least-privilege deploy SSH access to the Agonara VPS. Use Agonara-specific secret names rather than Nomos or generic VPS deploy secret names; keeping Agonara-specific names preserves release-unit isolation and makes deploy failures diagnosable.

### Release tag

- **Verdict:** pass.
- **Result:** `git tag --list 'agonara_v*'` returned no existing Agonara release tags.
- **Why:** The planned first tag `agonara_v0.1.0` is still available.
- **Evidence:** `scripts/release/check-agonara-release-readiness.js:57`; local `git tag --list 'agonara_v*'` returned an empty result.
- **Fix:** Create the tag only after trunk readiness and verification gates pass.

## Release Guidance

Proceed with the private internal-prod first-release path after the branch lands on trunk and the three deploy SSH secrets exist. Keep public prod exposure outside the tag gate until prod hostname, DNS ownership, Caddy route, and TLS ownership are recorded.

Industry best practice for the open secret question is:

- Use project-scoped secret names for deploy credentials.
- Scope the SSH key to the deploy user and required host path.
- Keep runtime provider keys in host-side env files rather than GitHub secrets when the deploy scripts do not need to read provider values.
- Re-run the readiness script after secret provisioning; the script invokes `gh secret list --json name`, so it verifies secret-name presence without reading secret values.

## Recommended Next Candidate

Provision the three Agonara GitHub deploy secrets, merge this branch to trunk, and rerun `node scripts/release/check-agonara-release-readiness.js --check-github-secrets`. If that script exposes deeper release wiring failures, fix those named failures before running the repo verification gates or creating `agonara_v0.1.0`.
