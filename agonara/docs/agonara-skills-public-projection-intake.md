---
date: 2026-06-30
model: claude-opus-4-8
description: "Intake brief: producer-side publish projection of Agonara operator skills from ai-labs into the public agonara-skills tap repo (role-scoped student/curator subfolders), feeding agonara ADR-025."
---

# Intake — Public Agonara-Skills Projection (Producer Side)

Context capture for the workflow that projects Agonara's operator skills from
`ai-labs/agonara/skills/` into a public `agonara-skills` repo consumed by Hermes
as a managed skill **tap**. This is the **producer** half; the consumer/host half
is recorded in `inventory/vps/Hermes/adr/adr-001-canonical-skill-distribution.md`.
This brief is the input to a new ai-labs ADR (`agonara/docs/adr/adr-025`) that
resolves the distribution question parked in
`agonara/skills/operator-skill-packaging_pre_adr.md`.

## What I'm Building

A deterministic **publish projection** plus the CI workflow that runs it. On
changes to the curator/student-relevant Agonara skills, it projects the single
upstream `agonara/skills/` into a **public** GitHub repo `agonara-skills` shaped
as two role-scoped, flat subfolders — `student/` and `curator/` — each containing
only its bucket's skills. The partition (which skill is a student vs a curator
skill) is **owned by the source of truth and made structural by the subfolders**;
each Hermes profile discovers and installs only its role subfolder. (This is an
install/packaging-isolation guarantee, not a confidentiality boundary — the repo is
public, so the other role's subtree is still retrievable; it is simply never
installed into the wrong profile.)

The projection additionally (a) **strips user-specific reference content** so no
personal data reaches the public repo, and (b) **stamps provenance** (the ai-labs
commit SHA it was projected from, plus a per-skill-tree content hash). It is a
generated mirror in one direction only: `agonara/skills/` is upstream; the public
repo is never authored directly.

This task produces the *decision and the pipeline*. The ADR records the decision
and invariants; the workflow + an implementation plan follow it.

## What I'm Touching

- **New** `.github/workflows/<agonara-skills-publish>.yml` — modeled on
  `.github/workflows/sync-skills-public.yml:1` (checkout target public repo via a
  PAT, project, commit + push).
- **New** public repo `agonara-skills` (created out of band; the workflow pushes
  to it). A **new repo PAT secret** is required to push (analogous to
  `PUBLIC_REPO_PAT`). This is a producer-side *push* and does not violate the
  host's "no inbound key" rule (inventory D7), which constrains the *host*.
- **New** publish allowlist / bucket manifest in ai-labs — the source-owned
  declaration of `student/` and `curator/` membership that drives the projection.
- `agonara/skills/**` — the upstream skill content being projected.
- `agonara/skills/operator-skill-packaging_pre_adr.md` — to be **superseded** by
  agonara ADR-025 (its open "distribution model" question is what this resolves).
- `agonara/docs/adr/adr-025-…md` — **new** ADR (next number after `adr-024`).
- `agonara/tests/operator-skill-contract.test.js` — the cross-bucket parity /
  route-citation guard; must stay green after any restructure.

## Findings

- **Scope:** Searched `ai-labs/agonara/skills/`, `.github/workflows/`, `scripts/`,
  `agonara/backlog/`, agonara docs, and the **`inventory`** repo
  (`vps/Hermes/**`). Covered the one existing public-sync precedent and the live
  Hermes deployment tooling. Excluded unrelated projects in the ai-labs monorepo.
- **Pattern evidence:** `.github/workflows/sync-skills-public.yml` is the direct
  analog (rsync of `dev-skills/public/**` → `igor1309/skills` via
  `PUBLIC_REPO_PAT`, `.publishignore` exclusions, version from `marketplace.json`,
  commit + push). The producer-side projection here is the same hop with a
  role-bucketed, privacy-scrubbed, provenance-stamped output instead of a folder
  mirror.

### Decided (converged with inventory ADR-001, revised 2026-06-30)

- **One public repo, two role subfolders**, each a flat projection of upstream.
  Producer owns the partition; consumer taps its subfolder. (Rejected: flat repo
  with host-side bucketing — leaks a source-of-truth decision to the consumer and
  is how curator skills already drifted into the student tree. Rejected: two
  separate repos — no gain over subfolders, and the subfolder shape is confirmed
  feasible (inventory gate 1a, verified 2026-06-30), so it is not even a held
  fallback.)
- **Bucket lists (the publish allowlist):**
  - `student/`: `agonara-api-access`, `agonara-membership`, `agonara-student`,
    `agonara-coach`, `button-quiz-loop`, `assistant-authored-study-drills`,
    `oral-exam-drills`.
  - `curator/`: `agonara-api-access`, `agonara-membership`,
    `agonara-curator-corpus`, `agonara-curator-assessment`,
    `agonara-curator-research`, `agonara-curator-participation`.
  - **Shared to both:** `agonara-api-access`, `agonara-membership` — authored once
    upstream, projected into both subfolders, so they cannot independently drift.
  - **`agonara-coach` → student bucket.** It was added 2026-06-29 (one day before
    inventory ADR-001) as the "explaining half" of student and co-installs with
    `agonara-student` per `agonara/skills/README.md`. ai-labs upstream already
    documents this; the omission was downstream (now fixed in inventory ADR-001
    §1/§4).
  - **`agonara-admin` is not published** until its placement is resolved
    (inventory Open Q #3).

### Privacy gotcha (must not leak)

The canonical tree carries **user-specific reference files** that would publish
personal data to a public repo. The projection MUST exclude them:

- `agonara/skills/assistant-authored-study-drills/references/user-calibration-notes.md`
  (contains a recorded "71/100"), `…/user-specific-preferences.md`,
  `…/button-flow-failures.md`.
- `agonara/skills/agonara-coach/references/routing-calibration.md`.

In-skill `references/` and files like `agonara-curator-corpus/concept-extraction.md`
that are *product* content DO ship. The split is per-file, not per-folder.

### Existing deployment being superseded

`inventory/vps/Hermes/scripts/deploy-agonara-skills.sh` push-copies skill folders
from `ai-labs/agonara/skills/` to three host trees (canonical store + both
profiles) via `scp`, run from a trusted Mac. It does **not** filter by role (it
pushes every skill to all trees), which is the root cause of the curator-into-
student drift. The tap model replaces it; the bespoke drift tooling is retired
only after the managed path is proven (inventory §6).

## Key Constraints

- **D1 (single upstream).** `agonara/skills/` is the only source; the public repo
  is a deterministic projection, never independently authored.
- **D6 (public, content-only, privacy-scrubbed).** Only runtime-agnostic product
  content; no host details, IPs, keys, or user-specific reference data.
- **Producer owns the partition.** Bucket membership is decided here, structurally,
  by subfolder — not re-derived on the host.
- **Shared foundations are duplicated by the projection, single upstream edit
  point.** One copy in `agonara/skills/`, written into both subfolders.
- **No dangling links in shipped `SKILL.md`.** Curator↔student never co-install; a
  shipped skill must not reference another role's skill or repo-only
  `research/`/`docs/` paths (`agonara/skills/README.md` authoring rule).
- **Parity test stays green.** `operator-skill-contract.test.js` guards
  duplicate-and-guard cross-bucket content and route citations.
- **Provenance.** Each release records the upstream commit SHA + per-skill-tree
  content hash (inventory D1/D8 depend on this being produced here).

## Risks & Unknowns

- **Subfolder-tap registration is a direct `taps.json` write, not a CLI flag.**
  The subfolder *capability* is confirmed (inventory gate 1a, verified 2026-06-30:
  taps persist `{repo, path}` in `.hub/taps.json`, one repo tappable at two
  subpaths), so the two-repo fallback is dropped. But `hermes skills tap add` does
  not expose the subfolder `path` (it defaults to `skills/`); scoping to `student/`
  / `curator/` is a consumer-owned direct `taps.json` edit — a host concern, noted
  here only so the producer does not assume a CLI affordance that does not exist.
- **Shared-foundation dedup mechanics** (inventory Open Q #6): the projection must
  copy `api-access`/`membership` into both subfolders as **real files** (a tap
  needs real content, not a symlink) while keeping one upstream edit point.
- **Privacy-scan rot.** An allowlist + content scan can miss a *new* kind of
  personal file. Cheaper to prevent upstream (authoring rule: personal content
  never enters the canonical tree) than to police at publish time.
- **Provenance format/location** in the published repo is undefined (a top-level
  manifest? per-subfolder? commit trailer?) — to be pinned by the ADR.
- **Trigger/cadence** (inventory Open Q #2) is unresolved on the producer side.

## Open Questions (for ADR-025, not blocking this brief)

These are the producer-side decisions the inventory ADR explicitly leaves to
ai-labs. Leans included; the ADR resolves them.

1. **Publish trigger.** CI-on-push to `trunk` with a `paths:` filter over the
   projected skill folders (mirroring `sync-skills-public.yml`), vs a
   manual/release-gated publish. *Lean:* CI on push to trunk, filtered to the
   projected paths, but emitting a pinned, provenance-stamped release rather than
   tracking head — the host installs from the pinned ref (inventory D8).
2. **Shared-foundation dedup.** *Lean:* the projection copies the single upstream
   foundation folder into both subfolders as real files; no symlinks in the
   published repo.
3. **Privacy boundary placement.** Upstream authoring rule (personal content never
   in the canonical tree) as the primary mechanism, with the publish-time scan as
   a backstop — vs publish-time scrub only. *Lean:* upstream rule primary; this
   extends the producer-owns-scope principle to public/private classification.
## Cross-References

- Consumer-side decision: `inventory/vps/Hermes/adr/adr-001-canonical-skill-distribution.md`.
- Pre-ADR this resolves: `agonara/skills/operator-skill-packaging_pre_adr.md`.
- Plugin mechanics (Claude Code, verified): `agonara/skills/claude-code-plugin-system.md`.
- Skill authoring + bucket rules: `agonara/skills/README.md`.
- Parity guard: `agonara/tests/operator-skill-contract.test.js`.
- CI precedent: `.github/workflows/sync-skills-public.yml`.
