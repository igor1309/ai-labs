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
- Inventory check for `root@172.245.246.108` and installed local agent SSH key evidence.
- Non-interactive SSH verification with `~/.ssh/id_ed25519`.
- `gh secret set AGONARA_VPS_HOST`, `gh secret set AGONARA_VPS_USER`, and `gh secret set AGONARA_VPS_SSH_KEY`.

## Results

### Readiness script

- **Verdict:** fail.
- **Result:** both readiness-script invocations stopped at the release branch guard.
- **Observed output:** `ERROR: releases are only allowed from trunk (current branch: codex/agonara-adr018-runtime)`.
- **Why:** The runbook requires the first-release readiness script to run from trunk before the tag is pushed. The script enforces that invariant before any deeper release wiring checks.
- **Evidence:** `agonara/docs/deployment-handoff.md:319`; `agonara/docs/deployment-handoff.md:323`; `scripts/release/check-agonara-release-readiness.js:51`.
- **Fix:** Merge this branch to trunk, make the trunk worktree clean, then rerun `node scripts/release/check-agonara-release-readiness.js --check-github-secrets`.

### GitHub deploy secrets

- **Verdict:** pass.
- **Result:** `gh secret list --json name` now reports all required Agonara deploy secret names present.
- **Names:** `AGONARA_VPS_HOST`, `AGONARA_VPS_USER`, `AGONARA_VPS_SSH_KEY`.
- **Why:** The deployment handoff requires these repo secrets before the first release can upload source to agonara-vps. Provider, smoke, bootstrap, and backup secrets stay host-side in tier env files.
- **Evidence:** `agonara/docs/deployment-handoff.md:285`; `scripts/release/check-agonara-release-readiness.js:24`; `scripts/release/check-agonara-release-readiness.js:709`; `scripts/release/check-agonara-release-readiness.js:734`; `gh secret list --json name` returned all three required names after provisioning.
- **Fix:** No fix remains for secret-name presence. Re-run the readiness script from trunk so it can evaluate the secret gate after the trunk guard passes.

### Deploy user and SSH key

- **Verdict:** pass.
- **Result:** Inventory identifies Agonara as `root@172.245.246.108`, and non-interactive SSH with `~/.ssh/id_ed25519` succeeded as `root` on `racknerd-b0381fe`.
- **Why:** The current first-release deploy workflow writes to `/tmp/agonara-deploy`, executes scripts under `/opt/agonara`, uses Docker/Compose, and relies on root-owned host env and cron files. Using `root` matches the current documented host model for this release path.
- **Evidence:** `/Users/igormalyarov/Developer/my-apps/inventory/infra.md:61`; `/Users/igormalyarov/Developer/my-apps/inventory/vps/racknerd-agonara/log.md:69`; `.github/workflows/release-unit.yml:291`; `.github/workflows/release-unit.yml:302`; `.github/workflows/release-unit.yml:369`; `.github/workflows/release-unit.yml:412`.
- **Fix:** Keep `AGONARA_VPS_USER=root` for the first release. A future non-root deploy user should be introduced as a separate host-hardening change with sudo/Docker group scope, `/opt/agonara` ownership updates, and deploy-script/readiness coverage.

### Release tag

- **Verdict:** pass.
- **Result:** `git tag --list 'agonara_v*'` returned no existing Agonara release tags.
- **Why:** The planned first tag `agonara_v0.1.0` is still available.
- **Evidence:** `scripts/release/check-agonara-release-readiness.js:57`; local `git tag --list 'agonara_v*'` returned an empty result.
- **Fix:** Create the tag only after trunk readiness and verification gates pass.

## Release Guidance

Proceed with the private internal-prod first-release path after the branch lands on trunk. Keep public prod exposure outside the tag gate until prod hostname, DNS ownership, Caddy route, and TLS ownership are recorded.

Industry best practice for the open secret question is:

- Use project-scoped secret names for deploy credentials.
- Scope the SSH key to the deploy user and required host path; Agonara currently uses `root` because the deployment scripts and host-owned assets are root-oriented.
- Keep runtime provider keys in host-side env files rather than GitHub secrets when the deploy scripts do not need to read provider values.
- Re-run the readiness script after secret provisioning; the script invokes `gh secret list --json name`, so it verifies secret-name presence without reading secret values.

## Recommended Next Candidate

Land this branch on trunk, then rerun `node scripts/release/check-agonara-release-readiness.js --check-github-secrets`. If that script exposes deeper release wiring failures, fix those named failures before running the repo verification gates or creating `agonara_v0.1.0`.
