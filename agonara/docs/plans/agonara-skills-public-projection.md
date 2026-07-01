---
date: 2026-07-01
model: claude-opus-4-8
description: "Implementation plan for the Agonara-Skills public projection (ADR-025, spec agonara-skills-public-projection): the deterministic projector, source manifest, repo assets, and publish workflow."
status: planned
type: implementation-plan
---

# Agonara-Skills Public Projection Implementation Plan

## Goal

Implement [Agonara-Skills Public Projection](../specs/agonara-skills-public-projection.md)
under [ADR-025](../adr/adr-025-public-agonara-skills-projection.md): a deterministic
Node projector (`agonara/scripts/project-public-skills.mjs`) driven by a source-owned
manifest that renders `agonara/skills/` into a staged `agonara-skills` tree of two
role subfolders (`student/`, `curator/`), privacy-scrubbed and provenance-stamped,
plus the CI workflow that publishes it as an immutable, provenance-pinned release.
The projector fails closed on any breach of spec rules R1–R13.

## Source of truth

The spec is the contract; every step below cites the spec rule (Rn) it satisfies.
Where this plan and the spec disagree, the spec wins — update the spec first, then
this plan. No behavior here beyond the spec's R1–R13 and Done criteria.

## Dependency gate (out-of-band, human-owned)

These are prerequisites the executor MUST confirm; the code in Phases 2–8 can be
built and unit-tested without them, but the workflow cannot publish until they hold:

1. **Public repo exists.** `agonara-skills` created on the target GitHub owner,
   public, empty (ADR consequence — "created out of band").
2. **Repo PAT secret.** A push-scoped PAT stored as an ai-labs CI secret (analogous
   to `PUBLIC_REPO_PAT`), restricted to the `agonara-skills` repo.
3. **Repo protection (R8).** Branch/tag rulesets on `main` and `release/*`
   restricting push and tag-creation to the projection CI identity — inspected via
   `gh api repos/<owner>/agonara-skills/rulesets` at closeout.

Phase 1 (upstream hygiene, R12) is **not** out-of-band — it is the first in-repo
step and MUST land before any first publish.

## Execution mode

Execution mode: human-review-gated
Human review between tasks: yes
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, unmet dependency gate, explicit user interruption
Push policy: push at closeout

## Execution lock

Worktree mode: create new
Expected worktree: set at execution
Expected branch: `claude/agonara-skills-projection-impl-*`
Preflight check: [ ] (executor establishes the lock at execution start)

## Scope guardrails

- Implement only spec R1–R13. Do **not** add consumer install/seal/reconciliation,
  `agonara-admin` publication, a plugin marketplace, or any skill-content change
  beyond the R12 hygiene pass (ADR Non-Goals).
- `agonara/skills/` stays the single edit point. The projector never hand-authors
  the public tree; the manifest is the sole partition declaration (R2).
- The projector is a **pure function** of (upstream tree, manifest, assets, SHA):
  no wall-clock, hostname, or filesystem-ordering input reaches the output (R1, R7).
- Privacy is **assert-absence**, not strip: personal content is gone from source
  after Phase 1; the projector fails if it reappears (R6 gate 1), never quietly
  removes it.
- Follow strict TDD (`strict-tdd` skill): each behavior step writes a failing test
  that compiles and asserts the missing behavior (RED), makes it pass (GREEN), then
  commits. Compilation errors are not RED.
- Node 22 for all `node`/`npm`/`npx` per `agonara/CLAUDE.md`; run tests/build via
  `./scripts/run_silent.sh`.

## Phase 1 — Upstream hygiene (R12 precondition)

Relocate personal reference content out of the canonical tree and remove the shipped
pointers to it, so R6 gate 1 can pass. Confirm the relocation destination with the
user before moving (out of `agonara/skills/`; not into any published path) — the
gate requires only absence from `agonara/skills/`, not a specific destination.

- **Step 1.1** — Relocate the four `forbiddenSourcePaths` files
  (`assistant-authored-study-drills/references/user-calibration-notes.md`,
  `…/user-specific-preferences.md`, `…/button-flow-failures.md`,
  `agonara-coach/references/routing-calibration.md`) out of `agonara/skills/`.
  Remove the now-empty `references/` dir under `agonara-coach` if it holds nothing
  else. Commit: `agonara: relocate personal reference files out of skills tree`.
- **Step 1.2** — Remove the three lines in
  `agonara/skills/assistant-authored-study-drills/SKILL.md` that describe the
  relocated `references/` files, plus any surrounding text that only exists to
  introduce them. Verify `operator-skill-contract.test.js` stays green
  (`./scripts/run_silent.sh "tests" npm test`). Commit:
  `agonara: drop shipped references to relocated personal files`.

Gate: `grep -r` finds none of the four basenames under `agonara/skills/` (files or
`SKILL.md` references) — the R6 gate 1 condition.

## Phase 2 — Manifest and repo assets

- **Step 2.1** — Author `agonara/skills-publish-manifest.json` exactly as the spec
  interface declares (`sharedFoundations`, `buckets.student`, `buckets.curator`,
  `ship`, `forbiddenSourcePaths`). Commit: `agonara: add public-skills publish manifest`.
- **Step 2.2** — Add `agonara/publish-assets/README.md` (a public-repo landing
  README describing the two role subfolders and that the tree is generated) and
  `agonara/publish-assets/LICENSE` (project license). Commit:
  `agonara: add public-skills repo assets`.

## Phase 3 — Projector core: structure, partition, foundations (R1–R5)

New file `agonara/scripts/project-public-skills.mjs`; tests in
`agonara/tests/public-skills-projection.test.js` against a `makeUpstreamTree(...)`
helper. One RED→GREEN→commit per step.

- **Step 3.1 (R1 clean rebuild + allowlist-exact)** — Test 1, Test 2: staging is
  emptied each run; two runs are byte-identical; the staged file set equals exactly
  `SKILL.md`+`ship[]` per bucketed skill + both foundations in both buckets + the
  closed repo-level set. Commit: `agonara: project skills into role subfolders (allowlist)`.
- **Step 3.2 (R2/R3 partition + bucket integrity)** — Test 3, Test 4, Test 5:
  buckets read only from the manifest; name never inferred; `student/`/`curator/`
  sets match the manifest; a skill in both non-foundation buckets fails;
  `agonara-admin` absent from both and non-fatal when unbucketed. Commit:
  `agonara: enforce manifest-owned bucket partition`.
- **Step 3.3 (R4 shared foundations)** — Test 6: foundations copied as real files
  (no symlink) into both subfolders, byte-identical to upstream by tree hash.
  Commit: `agonara: dedup shared foundations as real files`.
- **Step 3.4 (R5 content scope)** — Test 7: stray `research/` not copied;
  unexpected top-level entry fails; the exact closed root passes. Commit:
  `agonara: scope projected content to product files`.

## Phase 4 — Privacy gates (R6)

- **Step 4.1 (gate 1 absence)** — Test 8: a `forbiddenSourcePaths` file present in
  source fails with `kind: forbidden-source`; a `SKILL.md` still referencing a
  forbidden basename fails the same kind; clean passes. Commit:
  `agonara: fail publish on forbidden source content`.
- **Step 4.2 (gate 2 allowlist-for-review)** — Test 9: an undeclared file under a
  bucketed skill fails with `kind: undeclared-file`; adding it to `ship[]` ships it.
  Commit: `agonara: flag undeclared skill files for review`.
- **Step 4.3 (gate 3 output scan)** — Test 10: synthetic markers (`71/100`,
  `user-specific`, a denylisted host string) in staged output fail with
  `kind: personal-marker`; clean product content passes. Commit:
  `agonara: add personal-data output backstop scan`.

## Phase 5 — Provenance (R7)

- **Step 5.1 (tree hash)** — Test 11: the R7 canonical tree-hash algorithm
  (sorted POSIX relpaths, lowercase hex sha256, LF-joined) matches an independent
  recomputation. Commit: `agonara: compute canonical per-tree content hashes`.
- **Step 5.2 (provenance file + determinism)** — Test 11 (shape) + Test 12:
  `provenance.json` carries `upstreamCommit`/`hashAlgo`/sorted `trees`, fixed key
  order, no wall-clock field, byte-identical across runs. Commit:
  `agonara: emit deterministic provenance.json`.

## Phase 6 — Contract checks over generated output (R9, R10)

- **Step 6.1 (route citations + item-quality parity)** — Test 13, Test 14: reuse
  the citation/OpenAPI-route and item-quality-block logic from
  `operator-skill-contract.test.js` over the **staged** trees; a bad citation or a
  diverged guarded block fails. Extract shared logic into an importable helper so
  the projector and the existing test call one implementation. Commit:
  `agonara: run route + parity contract checks on projected output`.
- **Step 6.2 (link resolution)** — Test 15: a projected `SKILL.md` Markdown link to
  `../../research/…` or another role's skill fails; same-bucket/foundation links
  that resolve within the subfolder pass. Commit:
  `agonara: verify projected skill links resolve in-subfolder`.

## Phase 7 — CLI and report contract (R1 purity, report kinds)

- **Step 7.1** — Wire the CLI flags (`--upstream-sha`, `--skills-dir`, `--manifest`,
  `--assets`, `--openapi`, `--out`, `--report`), exit codes (`0`/`1`/`2`), and the
  `{ok, failures:[{rule,kind,detail}]}` report emitted on every run. Tests assert a
  specific `kind` per failure mode and that a breach lists all failures, not just
  the first. Commit: `agonara: add projector CLI and structured report`.

## Phase 8 — Publish workflow (R13, R11, R8)

New `.github/workflows/agonara-skills-publish.yml`, modeled on
`sync-skills-public.yml`; workflow-level tests in
`agonara/tests/public-skills-publish-workflow.test.js`.

- **Step 8.1 (R13 trigger)** — Test 18: `on.push` to `trunk` filtered to the full
  input set (`agonara/skills/**`, the manifest, `agonara/publish-assets/**`, the
  projector, `agonara/docs/api/openapi.yml`, the workflow file) plus
  `workflow_dispatch`, asserted over the parsed YAML. Commit:
  `agonara: add public-skills publish workflow trigger`.
- **Step 8.2 (R11 atomic + idempotent tag)** — Test 16: the publish job runs the
  projector, and on a green report commits payload + `provenance.json` in one commit
  and creates the annotated `release/<upstream-short-sha>` tag; a re-run for an
  already-published SHA is a no-op. Commit: `agonara: publish atomically with pinned release tag`.
- **Step 8.3 (R8 ancestry guard)** — Test 17: over a two-commit git fixture, the
  pre-publish guard rejects a fetched HEAD not descended from the last release tag
  (`kind: not-descendant`) and accepts a descendant. Commit:
  `agonara: guard publish against non-descendant public history`.

## Closeout

- Run the full gate: `./scripts/run_silent.sh "tests" npm test` and
  `./scripts/run_silent.sh "build" npx tsc --noEmit` (Node 22) — all green.
- Confirm Phase-1 gate (`grep` finds no forbidden basenames under `agonara/skills/`).
- Confirm the Dependency-gate items: repo exists, PAT secret present, and
  `gh api repos/<owner>/agonara-skills/rulesets` shows the R8 protections.
- Update `agonara/docs/log.md` (implementation entry) and move the spec to
  `agonara/docs/specs/implemented/`.
- Supersede `agonara/skills/operator-skill-packaging_pre_adr.md` per ADR-025.
- Open one PR for the task (merge strategy `--merge`, `--auto --delete-branch` per
  repo PR policy); push at closeout.

## Traceability

| Spec rule | Phase.Step | Test(s) |
|---|---|---|
| R1 determinism / allowlist-exact | 3.1, 7.1 | 1, 2, 12 |
| R2 source-owned partition | 3.2 | 4 |
| R3 bucket membership | 3.2 | 5 |
| R4 shared foundations | 3.3 | 6 |
| R5 content scope | 3.4 | 7 |
| R6 privacy gates | 4.1–4.3 | 8, 9, 10 |
| R7 provenance | 5.1, 5.2 | 11, 12 |
| R8 projection-only / ancestry | 8.3 (+ closeout inspect) | 17 |
| R9 contract checks | 6.1 | 13, 14 |
| R10 link resolution | 6.2 | 15 |
| R11 atomic pinned publish | 8.2 | 16 |
| R12 hygiene precondition | 1.1, 1.2 | (grep gate) |
| R13 publish trigger | 8.1 | 18 |
