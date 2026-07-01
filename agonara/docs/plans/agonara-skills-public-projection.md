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
role subfolders (`student/`, `curator/`), privacy-scrubbed at publish and
provenance-stamped, plus the CI workflow that publishes it as an immutable,
provenance-pinned release. The projector fails closed on any breach of spec rules
R1–R12.

## Source of truth

The spec is the contract; every step cites the spec rule (Rn) it satisfies. Where
this plan and the spec disagree, the spec wins — update the spec first, then this
plan. No behavior here beyond the spec's R1–R12 and Done criteria.

## Dependency gate (out-of-band, human-owned)

Prerequisites the executor MUST confirm; the code in Phases 1–6 builds and
unit-tests without them, but the workflow (Phase 7) cannot publish until they hold:

1. **Public repo exists.** `agonara-skills` created on the target GitHub owner,
   public, empty (ADR consequence — "created out of band").
2. **Repo PAT secret.** A push-scoped PAT stored as an ai-labs CI secret (analogous
   to `PUBLIC_REPO_PAT`), restricted to the `agonara-skills` repo.
3. **Repo protection (R8).** Branch/tag rulesets on `main` and `release/*`
   restricting push and tag-creation to the projection CI identity — inspected via
   `gh api repos/<owner>/agonara-skills/rulesets` at closeout.

No upstream hygiene / file relocation is required (ADR P12 withdrawn): the four
personal reference files stay in `agonara/skills/`. They are simply absent from the
`ship` allowlist so they are never published, and the manifest `scrub` removes the
`SKILL.md` section that names them — nothing is moved.

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

- Implement only spec R1–R12. Do **not** add consumer install/seal/reconciliation,
  `agonara-admin` publication, or a plugin marketplace (ADR Non-Goals).
- `agonara/skills/` is **not edited**. The projector transforms only the published
  copy (the declared `scrub`); the canonical tree stays the single edit point (R2).
- The projector is a **pure function** of (upstream tree, manifest, assets, SHA):
  no wall-clock, hostname, or filesystem-ordering input reaches the output (R1, R7).
- Privacy is drawn at publish: allowlist for files + section scrub for personal
  prose + output-scan backstop (R6). Personal files remain in source; nothing is
  relocated.
- Follow strict TDD (`strict-tdd` skill): each behavior step writes a failing test
  that compiles and asserts the missing behavior (RED), makes it pass (GREEN), then
  commits. Compilation errors are not RED.
- Node 22 for all `node`/`npm`/`npx` per `agonara/CLAUDE.md`; run tests/build via
  `./scripts/run_silent.sh`.

## ADR traceability matrix

| ADR invariant | Realized by (spec rule) | Phase |
|---|---|---|
| P1 single upstream / deterministic | R1 | Phase 2 |
| P2 source-owned partition | R2 | Phase 2 |
| P3 bucket membership | R3 | Phase 2 |
| P4 shared foundations | R4 | Phase 2 |
| P5 public, content-scoped | R5 | Phase 2 |
| P6 privacy publish boundary | R6 | Phase 3 |
| P7 provenance | R7 | Phase 4 |
| P8 projection-only / ancestry | R8 | Phase 7 |
| P9 projection contract checks | R9 | Phase 5 |
| P10 no dangling links | R10 | Phase 5 |
| P11 atomic pinned publish | R11 | Phase 7 |
| P12 (withdrawn) | — | — |
| Open Q1 publish trigger | R12 | Phase 7 |

## Phase 1 — Manifest and repo assets

**Objective.** Land the source-owned manifest and the static public-repo assets the
projector reads.

**Key work items.**
- Step 1.1 — Author `agonara/skills-publish-manifest.json` exactly as the spec
  interface declares: `sharedFoundations`, `buckets.student`, `buckets.curator`,
  `ship` (the single allowlist), `scrub`
  (`assistant-authored-study-drills` → `["## References"]`). Commit:
  `agonara: add public-skills publish manifest`.
- Step 1.2 — Add `agonara/publish-assets/README.md` (landing README: two role
  subfolders, generated tree) and `agonara/publish-assets/LICENSE`. Commit:
  `agonara: add public-skills repo assets`.

**Dependencies.** None.
**Risks.** Manifest drift from the actual skill folder contents — mitigated by
R1's allowlist-exact test pinning the staged output to exactly `SKILL.md` + `ship[]`,
so a forgotten product file shows up as a missing publish.
**Validation.** `node -e` parses the manifest JSON; `./scripts/run_silent.sh "tests" npm test`
stays green (no projector yet, existing suite unaffected).
**Completion signal.** Manifest + both assets exist and parse.

## Phase 2 — Projector core: structure, partition, foundations, scope (R1–R5)

**Objective.** A projector that stages the allowlist projection into role subfolders
deterministically, with the manifest as the sole partition authority.

**Key work items** (new `agonara/scripts/project-public-skills.mjs`; tests in
`agonara/tests/public-skills-projection.test.js` via a `makeUpstreamTree(...)`
helper; one RED→GREEN→commit each):
- Step 2.1 (R1) — Test 1, Test 2, Test 3: clean rebuild; byte-identical reruns;
  allowlist-exact staged file set; missing/extra-skill handling. Commit:
  `agonara: project skills into role subfolders (allowlist)`.
- Step 2.2 (R2/R3) — Test 4, Test 5: buckets read only from the manifest; sets match
  the declaration; both-bucket and unbucketed handling. Commit:
  `agonara: enforce manifest-owned bucket partition`.
- Step 2.3 (R4) — Test 6: foundations copied as real files into both subfolders,
  byte-identical to upstream by tree hash. Commit:
  `agonara: dedup shared foundations as real files`.
- Step 2.4 (R5) — Test 7: stray `research/` and unshipped `references/` files not
  copied; unexpected top-level entry fails; exact closed root passes. Commit:
  `agonara: scope projected content to product files`.

**Dependencies.** Phase 1 (manifest, assets).
**Risks.** Nondeterminism from directory-read order — mitigated by sorting all file
lists before copy/hash (R1, R7 step 2).
**Validation.** `./scripts/run_silent.sh "tests" npm test` (Tests 1–7 green);
`./scripts/run_silent.sh "build" npx tsc --noEmit`.
**Completion signal.** A sample tree projects to the exact expected staged shape.

## Phase 3 — Privacy publish boundary (R6)

**Objective.** Draw the publish boundary: allowlist files, scrub personal sections,
backstop-scan output.

**Key work items.**
- Step 3.1 (R6.1) — Test 8: only `SKILL.md` + `ship[]` publish; the personal
  reference files (and any other unshipped file) are not published and do not fail;
  adding a file to `ship[]` publishes it, removing it drops it — no second list.
  Commit: `agonara: publish only allowlisted skill files`.
- Step 3.2 (R6.2) — Test 9: the declared `## References` section (heading through the
  next same/higher heading) is removed from the **published** `SKILL.md`; surrounding
  content intact; no unshipped `references/` file name remains; source `SKILL.md`
  unchanged.
  Commit: `agonara: scrub declared personal sections from published skills`.
- Step 3.3 (R6.3) — Test 10: synthetic markers (`71/100`, `user-specific`, a
  denylisted host string) in staged output fail with `kind: personal-marker`; clean
  content passes. Commit: `agonara: add personal-data output backstop scan`.

**Dependencies.** Phase 2 (projector copies content to scrub).
**Risks.** A scrub heading-matcher that over-removes (eats a following section) or
under-removes — mitigated by Test 9 asserting the exact before/after boundaries.
**Validation.** `./scripts/run_silent.sh "tests" npm test` (Tests 8–10 green).
**Completion signal.** Published `assistant-authored-study-drills/SKILL.md` has no
`## References` block; a synthetic personal file/marker is blocked or excluded.

## Phase 4 — Provenance (R7)

**Objective.** Emit a deterministic, verifiable provenance record over the published
trees.

**Key work items.**
- Step 4.1 (R7 tree hash) — Test 11: the canonical tree-hash algorithm (sorted POSIX
  relpaths, lowercase-hex sha256, LF-joined) over the published files matches an
  independent recomputation. Commit: `agonara: compute canonical per-tree content hashes`.
- Step 4.2 (R7 file + determinism) — Test 11 (shape) + Test 12: `provenance.json`
  carries `upstreamCommit`/`hashAlgo`/sorted `trees`, fixed key order, no wall-clock
  field, byte-identical across runs. Commit: `agonara: emit deterministic provenance.json`.

**Dependencies.** Phase 3 (hash is over post-scrub published content).
**Risks.** Hash instability from JSON key order / path separators — mitigated by the
pinned serialization in R7.
**Validation.** `./scripts/run_silent.sh "tests" npm test` (Tests 11–12 green).
**Completion signal.** Two runs produce byte-identical `provenance.json`.

## Phase 5 — Contract checks over generated output (R9, R10)

**Objective.** Gate the publish on the operator-skill contract, evaluated over the
published trees.

**Key work items.**
- Step 5.1 (R9) — Test 13, Test 14: extract the citation/OpenAPI-route and
  item-quality-block logic from `operator-skill-contract.test.js` into an importable
  helper called by both that test and the projector; run it over the staged trees; a
  bad citation or diverged guarded block fails. Commit:
  `agonara: run route + parity contract checks on projected output`.
- Step 5.2 (R10) — Test 15: a published `SKILL.md` Markdown link to `../../research/…`
  or another role's skill fails (`kind: dangling-link`); same-bucket/foundation links
  pass; the scrubbed skill has no dangling `references/` link. Commit:
  `agonara: verify projected skill links resolve in-subfolder`.

**Dependencies.** Phase 2 (staged trees), Phase 3 (scrub removes the would-dangle
`## References` links before R10 runs).
**Risks.** Extracting shared logic could regress the existing test — mitigated by
running `operator-skill-contract.test.js` unchanged against the helper.
**Validation.** `./scripts/run_silent.sh "tests" npm test` (Tests 13–15 + the
existing contract test green).
**Completion signal.** Staged trees pass route, parity, and link checks.

## Phase 6 — CLI and report contract

**Objective.** Expose the projector as the spec CLI with a structured, assertable
report.

**Key work items.**
- Step 6.1 — Wire the CLI flags (`--upstream-sha`, `--skills-dir`, `--manifest`,
  `--assets`, `--openapi`, `--out`, `--report`), exit codes (`0`/`1`/`2`), and the
  `{ok, failures:[{rule,kind,detail}]}` report emitted on every run; assert a
  specific `kind` per failure mode and that a breach lists all failures, not just the
  first. Commit: `agonara: add projector CLI and structured report`.

**Dependencies.** Phases 2–5 (the gates the report surfaces).
**Risks.** A gate that throws instead of recording a `failures[]` entry — mitigated
by asserting `kind` per gate in the earlier phase tests once routed through the CLI.
**Validation.** `./scripts/run_silent.sh "tests" npm test`;
`./scripts/run_silent.sh "build" npx tsc --noEmit`.
**Completion signal.** A green run exits `0` with `ok:true`; each seeded breach exits
`1` with the expected `kind`.

## Phase 7 — Publish workflow (R12, R11, R8)

**Objective.** The CI workflow that runs the projector and publishes an atomic,
pinned, protected release.

**Key work items** (new `.github/workflows/agonara-skills-publish.yml`; workflow
tests in `agonara/tests/public-skills-publish-workflow.test.js`):
- Step 7.1 (R12) — Test 18: `on.push` to `trunk` filtered to the full input set
  (`agonara/skills/**`, the manifest, `agonara/publish-assets/**`, the projector,
  `agonara/docs/api/openapi.yml`, the workflow file) plus `workflow_dispatch`,
  asserted over parsed YAML. Commit: `agonara: add public-skills publish workflow trigger`.
- Step 7.2 (R11) — Test 16: the job runs the projector and, on a green report,
  commits payload + `provenance.json` in one commit and creates the annotated
  `release/<short-sha>` tag; a re-run for a published SHA is a no-op. Commit:
  `agonara: publish atomically with pinned release tag`.
- Step 7.3 (R8) — Test 17: over a two-commit git fixture, the pre-publish guard
  rejects a fetched HEAD not descended from the last release tag
  (`kind: not-descendant`) and accepts a descendant. Commit:
  `agonara: guard publish against non-descendant public history`.

**Dependencies.** Phase 6 (CLI + report the workflow invokes); Dependency gate items
1–2 to actually publish (not to author/test the workflow).
**Risks.** Cross-repo push auth / secret scoping — mitigated by modeling on the
proven `sync-skills-public.yml` and gating publish on the dependency-gate items.
**Validation.** `./scripts/run_silent.sh "tests" npm test` (Tests 16–18 green);
workflow YAML parses.
**Completion signal.** Workflow triggers on the declared inputs and the guarded,
atomic publish path is exercised by the fixture tests.

## Done criteria

- All phases complete; `./scripts/run_silent.sh "tests" npm test` and
  `./scripts/run_silent.sh "build" npx tsc --noEmit` (Node 22) green.
- Spec Done criteria met: green projector run emits the staged tree +
  `provenance.json` + assets with `ok:true`; each seeded breach exits `1` with the
  named `kind`.
- Privacy boundary proven: published `student/assistant-authored-study-drills/SKILL.md`
  has no `## References` section and no unshipped `references/` file name, and
  `agonara/skills/` is unchanged (`git diff` shows no source relocation).
- Dependency gate confirmed: repo exists, PAT secret present, and
  `gh api repos/<owner>/agonara-skills/rulesets` shows the R8 protections.
- `agonara/skills/operator-skill-packaging_pre_adr.md` superseded per ADR-025.

## Final closeout

Final gates: `./scripts/run_silent.sh "tests" npm test`; `./scripts/run_silent.sh "build" npx tsc --noEmit`; `gh api repos/<owner>/agonara-skills/rulesets` shows R8 protections; refresh `docs/loc-dashboard.html` from `./scripts/loc-dashboard.sh --sort=name` and reconcile.
Archive plan: `git mv agonara/docs/plans/agonara-skills-public-projection.md agonara/docs/plans/implemented/` and `git mv agonara/docs/specs/agonara-skills-public-projection.md agonara/docs/specs/implemented/`.
Commit archive move: yes — in the same PR as the implementation.
Push/PR: follow push policy (push at closeout); one PR for the task, merged with `--merge --auto --delete-branch`; update `agonara/docs/log.md`.
