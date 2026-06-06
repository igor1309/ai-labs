---
date: 2026-06-06
model: gpt-5
description: "Release readiness and Product Intent gap audit for Agonara after spec closeout."
---

# Agonara Release Readiness and Product Intent Gap Audit

## Scope

This audit checks whether Agonara can move from implemented-spec closeout into first-release execution. It does not re-review every implemented slice. It verifies the current docs and release gate evidence enough to decide whether the next work should be release execution, release-blocker closeout, or another product gap.

## Evidence Checked

- Product implementation and deferred-scope snapshot in `agonara/README.md:21`.
- Remaining backlog storage and product questions in `agonara/docs/backlog.md:10`.
- Deployment handoff status, first-release prerequisites, runbook, and open questions in `agonara/docs/deployment-handoff.md:15`.
- Spec status markers from `agonara/docs/specs/*.md`.
- First-release readiness script in `scripts/release/check-agonara-release-readiness.js:1`.
- Agonara log history in `agonara/docs/log.md:1`.

## Verdict

Agonara is ready for a first-release readiness preflight, not for an immediate release tag from this branch.

All current Agonara specs are marked implemented, and the deployment handoff records the major ADR/spec gates as closed. The remaining release risk is operational: the documented first-release path still requires trunk, GitHub deploy SSH secrets, and an explicit `agonara_v0.1.0` tag. Public production exposure remains a separate decision from the internal-prod deployment described by the runbook.

## Findings

### Finding 1: Product Intent implementation gap is no longer the primary first-release blocker

- **Verdict:** pass.
- **Why:** The current specs under `agonara/docs/specs/` all have `status: implemented`. The README also lists implemented backend, domain, and product surfaces across Identity, Operations, Program Membership, Corpus, navigation, accepted checks, Student Workspace open answers, Quick Check, learner state, readiness, coverage gaps, LLM-assisted curation suggestions, and the Admin board (`agonara/README.md:23`).
- **Evidence:** `agonara/README.md:23`, `agonara/README.md:25`, `agonara/README.md:36`; `agonara/docs/specs/*.md` status scan.
- **Fix:** Treat the next release-related step as operational preflight, not more Product Intent gap discovery.
- **Test impact:** No new tests needed for this audit finding. The release preflight still needs the documented gates before tagging.

### Finding 2: Immediate release is blocked by documented first-release prerequisites

- **Verdict:** fail.
- **Why:** The deployment handoff says the first-release runbook remains gated on GitHub deploy SSH secrets and an explicit `agonara_v0.1.0` tag (`agonara/docs/deployment-handoff.md:31`). It later records the repo secrets as still unchecked (`agonara/docs/deployment-handoff.md:285`) and requires the readiness script to run from trunk with `--check-github-secrets` before pushing the tag (`agonara/docs/deployment-handoff.md:311`). The script enforces trunk and a clean worktree before release (`scripts/release/check-agonara-release-readiness.js:51`) and checks the required deploy secret names when requested (`scripts/release/check-agonara-release-readiness.js:24`, `scripts/release/check-agonara-release-readiness.js:149`, `scripts/release/check-agonara-release-readiness.js:709`).
- **Fix:** After this branch lands on trunk, add or confirm `AGONARA_VPS_HOST`, `AGONARA_VPS_USER`, and `AGONARA_VPS_SSH_KEY` in GitHub repo secrets, then run `node scripts/release/check-agonara-release-readiness.js --check-github-secrets` from trunk before any tag push.
- **Test impact:** The readiness script is the targeted verification gate. If it fails, fix the named release wiring or secret-name issue before tagging.

### Finding 3: First release must be described as private internal-prod deployment, not full public launch

- **Verdict:** warning.
- **Why:** The handoff says staging is publicly routed, prod is deployed internally on loopback, and prod hostname/public TLS remain undecided (`agonara/docs/deployment-handoff.md:20`, `agonara/docs/deployment-handoff.md:75`). The runbook states the first release includes staging and internal-prod deploys while public prod routing remains separate (`agonara/docs/deployment-handoff.md:332`). Open questions still include prod domain/DNS/TLS ownership and production public exposure (`agonara/docs/deployment-handoff.md:342`, `agonara/docs/deployment-handoff.md:347`).
- **Fix:** Keep `agonara_v0.1.0` release notes and go/no-go language scoped to a private internal-prod deployment. If the objective changes to public production launch, decide the prod hostname, DNS ownership path, Caddy route, and TLS approach before tagging.
- **Test impact:** No automated test. The check is a release-governance review of the tag notes and release announcement.

### Finding 4: Product messaging must preserve intentional deferrals

- **Verdict:** warning.
- **Why:** The README explicitly defers recommendation ranking, persisted mastery models, and broader Student/Curator UI beyond the implemented `/learn` slices (`agonara/README.md:38`). The backlog keeps future storage questions open for learning-path sequencing, recommendation records, invalidated learner-state cache records, future membership-policy variants, and future `/learn` presentation state (`agonara/docs/backlog.md:16`).
- **Fix:** First-release notes should name the implemented slices and keep recommendation ranking, persisted mastery, and broader UI as future specs or plans. Do not market the release as a complete learning-platform launch.
- **Test impact:** No automated test. The check is release-note and README wording review.

## Release Guidance

Industry best practice is to separate deploy readiness from public launch readiness. For Agonara, that means:

- Use `agonara_v0.1.0` for the documented private first-release deployment only after trunk and deploy-secret gates pass.
- Keep public prod routing as a separate launch decision until hostname, DNS ownership, Caddy route, and TLS ownership are recorded.
- Use the readiness script as the release preflight source of truth, then run the repo verification gates and Docker verification from trunk before tagging.
- Keep release notes honest about intentional product deferrals.

## Recommended Next Candidate

Run the first-release preflight on trunk after this audit lands: provision or confirm the three GitHub deploy SSH secrets, run `node scripts/release/check-agonara-release-readiness.js --check-github-secrets`, then close any readiness failures before creating `agonara_v0.1.0`.

If the owner wants public prod exposure as part of the same release, first record a short release decision that pins prod hostname, DNS ownership, Caddy route, and TLS ownership. Otherwise, proceed with the internal-prod release path and keep public routing out of the tag gate.
