---
date: 2026-06-30
model: claude-opus-4-8
description: "Intake brief: producer-side publish projection of Agonara operator skills from ai-labs into the public agonara-skills repo (role-scoped student/curator subfolders), feeding agonara ADR-025."
---

# Intake — Public Agonara-Skills Projection (Producer Side)

Context capture for the workflow that projects Agonara's operator skills from
`agonara/skills/` into a public `agonara-skills` repo. This is the **producer**
half; how a consumer installs the result is out of scope (the current consumer's
decisions live in `inventory/vps/Hermes/adr/adr-001-canonical-skill-distribution.md`).
This brief is the input to `agonara/docs/adr/adr-025-public-agonara-skills-projection.md`,
which resolves the distribution question parked in
`agonara/skills/operator-skill-packaging_pre_adr.md`.

## What I'm Building

A deterministic **publish projection** plus the CI workflow that runs it. It
projects the single upstream `agonara/skills/` into a **public** GitHub repo
`agonara-skills` shaped as two role-scoped, flat subfolders — `student/` and
`curator/` — each containing only its bucket's skills. The partition (which skill
is a student vs a curator skill) is owned by the source of truth and made
structural by the subfolders, so a consumer never re-derives it. The projection
additionally strips user-specific reference content and stamps provenance
(upstream commit SHA + per-skill-tree content hash). `agonara/skills/` is
upstream; the public repo is generated, never authored directly.

This task produces the decision and the pipeline. The ADR records the decision
and invariants; the workflow and an implementation plan follow it.

## What I'm Touching

- **New** `.github/workflows/agonara-skills-publish.yml` — modeled on
  `.github/workflows/sync-skills-public.yml` (checkout target public repo via a
  PAT, project, commit + push).
- **New** public repo `agonara-skills` (created out of band; the workflow pushes
  to it), plus a **new repo PAT secret** to push (analogous to `PUBLIC_REPO_PAT`).
- **New** publish manifest in ai-labs — the source-owned declaration of `student/`
  and `curator/` membership that drives the projection.
- `agonara/skills/**` — the upstream skill content being projected.
- `agonara/skills/operator-skill-packaging_pre_adr.md` — superseded by ADR-025.
- `agonara/tests/operator-skill-contract.test.js` — the cross-bucket parity /
  route-citation guard; must stay green after any restructure.

## Findings

- **Scope:** Searched `agonara/skills/`, `.github/workflows/`, `scripts/`,
  `agonara/backlog/`, agonara docs, and the current consumer's tooling. Covered the
  one existing public-sync precedent and the existing deploy path. Excluded
  unrelated projects in the ai-labs monorepo.
- **Pattern evidence:** `.github/workflows/sync-skills-public.yml` is the direct
  analog (rsync of `dev-skills/public/**` → a public repo via `PUBLIC_REPO_PAT`,
  `.publishignore` exclusions, version from `marketplace.json`, commit + push). The
  projection here is the same hop with a role-bucketed, privacy-scrubbed,
  provenance-stamped output instead of a folder mirror.

### Bucket lists (the publish manifest)

- `student/`: `agonara-api-access`, `agonara-membership`, `agonara-student`,
  `agonara-coach`, `button-quiz-loop`, `assistant-authored-study-drills`,
  `oral-exam-drills`.
- `curator/`: `agonara-api-access`, `agonara-membership`, `agonara-curator-corpus`,
  `agonara-curator-assessment`, `agonara-curator-research`,
  `agonara-curator-participation`.
- **Shared to both:** `agonara-api-access`, `agonara-membership` — authored once
  upstream, projected into both subfolders.
- `agonara-coach` is in the student bucket (the explaining half of student;
  co-installs with `agonara-student` per `agonara/skills/README.md`).
- `agonara-admin` is not published until its placement is resolved.

### Privacy gotcha (must not leak)

The canonical tree carries **user-specific reference files** that would publish
personal data to a public repo. The projection MUST exclude them:

- `agonara/skills/assistant-authored-study-drills/references/user-calibration-notes.md`
  (contains a recorded "71/100"), `…/user-specific-preferences.md`,
  `…/button-flow-failures.md`.
- `agonara/skills/agonara-coach/references/routing-calibration.md`.

In-skill `references/` and files like `agonara-curator-corpus/concept-extraction.md`
that are product content DO ship. The split is per-file, not per-folder.

### Existing deployment being superseded

The skills reach a running agent today only via a hand-run copy that pushes every
skill folder to every role tree with no role filter — the root cause of the
curator-into-student drift. The projection + release model replaces it.

## Key Constraints

- **Single upstream.** `agonara/skills/` is the only source; the public repo is a
  deterministic projection, never independently authored.
- **Public, content-only, privacy-scrubbed.** Only runtime-agnostic product
  content; no host details, IPs, keys, or user-specific reference data.
- **Producer owns the partition.** Bucket membership is decided here, structurally,
  by subfolder — not re-derived by a consumer.
- **Shared foundations are duplicated by the projection**, from one upstream edit
  point, as byte-identical real files (no symlinks).
- **No dangling links in shipped `SKILL.md`.** Curator↔student never co-install; a
  shipped skill must not reference another role's skill or repo-only
  `research/`/`docs/` paths (`agonara/skills/README.md`).
- **Parity test stays green.** `operator-skill-contract.test.js` guards
  duplicate-and-guard cross-bucket content and route citations.
- **Provenance.** Each release records the upstream commit SHA + per-skill-tree
  content hash so a consumer can install from a pinned, verifiable ref.

## Risks & Unknowns

- **Shared-foundation dedup mechanics.** The projection must copy `api-access` /
  `membership` into both subfolders as byte-identical real files while keeping one
  upstream edit point.
- **Privacy-scan rot.** An allowlist + content scan can miss a new kind of personal
  file — cheaper to prevent upstream (personal content never enters the canonical
  tree) than to police at publish time.
- **Provenance format/location** in the published repo is undefined (top-level
  manifest, per-subfolder, or release metadata).
- **Trigger/cadence** is unresolved on the producer side.

## Open Questions (carried into ADR-025)

1. **Publish trigger.** CI-on-push to `trunk` vs a manual / release-gated publish.
   *Lean:* CI on `trunk`, emitting a pinned, provenance-stamped release rather than
   tracking head.
2. **Shared-foundation dedup.** *Lean:* the projection copies the single upstream
   foundation folder into both subfolders as real files; no symlinks.
3. **Privacy boundary placement.** *Lean:* upstream authoring rule (personal
   content never enters the canonical tree) as the primary mechanism, with the
   publish-time scan as a backstop.

## Cross-References

- Distribution decision: `agonara/docs/adr/adr-025-public-agonara-skills-projection.md`.
- Consumer-side decision: `inventory/vps/Hermes/adr/adr-001-canonical-skill-distribution.md`.
- Pre-ADR this resolves: `agonara/skills/operator-skill-packaging_pre_adr.md`.
- Skill authoring + bucket rules: `agonara/skills/README.md`.
- CI precedent: `.github/workflows/sync-skills-public.yml`.
