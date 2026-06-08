---
date: 2026-06-08
model: claude-opus-4-8
description: "Open task backlog and parked decisions for the traceability-review skill"
---

# Traceability Review — TODO

## Approach (direction)
- The skill is the product; the Agonara pipeline is the eval corpus, not a
  deliverable. Concrete findings matter only as evidence the method reasons well.
- Run each pass as an experiment. The payload is method behaviour fed back into
  `SKILL.md` / `references/` — a wobble is as valuable as a finding.
- Evals are **evaluated, not matched to the letter.** Judge whether the method
  reasoned soundly and reproduced *in spirit* — the verdict, the borderline calls,
  the row-generation discipline — not whether counts or prose match a golden file.
  Generative systems are non-deterministic; a fixed 100% outcome is neither the bar
  nor a proof the skill works on a different project.
- Don't chase breadth, depth, or completeness for its own sake. Run a module/shape
  only when it stresses the method in a new way; coverage is not a correctness guarantee.
- Lineage: a principled sibling to doc-drift-audit — ground truth is the upstream
  pipeline node, not the code.

## Workflow machinery
The skill runs as a dynamic workflow — `.claude/workflows/traceability-review.js` (+ `README.md`);
invoke `/traceability-review <project> [on "<Module>"]`. Pipeline: Scope → gate → Slice →
Passes (adr-spec / spec-tests / orphan) → Umbrella.

### Verification runs owed
Each is an experiment — evaluate the run, fold any wobble back into the workflow/skill.
- **Full-pipeline run of the calibrated `spec-tests` pass** (the focused run exercised the pass
  in isolation, skipping scope/gate/umbrella). Run a whole module end-to-end and confirm the new
  `indeterminate` open-questions flow into the **umbrella ledger** under `resolvingLayer: tests`
  without swamping it — a single module produced 12 indeterminate open-questions (Identity), so
  the ledger may need a per-layer summary count rather than a one-row-each dump.
- **Precondition short-circuit** (`ee2dcb2a`) against a project with **no ADRs/specs** — still
  never run. Confirm it bails ~30k with `status: precondition-not-met` and fabricates no modules.
- **Re-run a module that previously schema-flaked** (`subagent completed without calling
  StructuredOutput`) to characterise the flake — PM failed ~186–280k, Curator succeeded at 321k,
  so size alone does not explain it. Capture the slice size + row count of each run.
- **A second module's `spec-tests` run with dense positive gaps** to guard against the inverse
  over-correction: confirm a genuine *positive* coverage gap is not mislabelled `indeterminate`
  to dodge a finding. (On Identity FS:189 password-length correctly stayed a finding.)

### Calibration tweaks to watch
- **Move reconciliation from prompt to code.** The pass currently self-reports the tally; add a
  deterministic post-check in the workflow JS after the `spec-tests` agent returns — assert
  `covered+covered-shared+untested+indeterminate == rows.length`, `findings.length == untested`,
  `openQuestions ⊇ indeterminate ids` — and re-ask / flag on mismatch instead of trusting prose.
- **`indeterminate` is names-only-specific.** It means "absence not confirmable from titles," not
  "untestable." If the skill ever reads test bodies, this verdict collapses back into covered/
  untested — keep it scoped to the names-only pass.
- Watch the boundary between `indeterminate` (negative/absence guarantee) and a true `untested`
  positive clause; the residual judgement is whether a clause asserts a presence or an absence.

### Structural fixes
- Stabilise module identity across scope runs (scope re-segments and renames each run) — return
  stable ids, or stop keying the gate on agent-named module names. Passing a module name is a
  gamble until this is fixed.
- Make scope's per-module row estimate trustworthy or stop relying on it (it returned 0 for a
  ~99-row module).
- Settle schema vs markdown for pass output once the flake above is characterised.
- Decide whether to freeze `evals/traceability-reviews/` outputs as `evals.json` regression fixtures.

### Process for these runs
- Prefer a **focused one-off workflow** (slice + the single pass under test) over the full
  pipeline when verifying one pass — the spec-tests calibration was confirmed for ~160k / 2
  agents this way vs ~200–320k for a whole module. Pattern: copy `RESOLVE`, the slice instruction,
  the schema, and the pass instruction verbatim from `traceability-review.js` so the test is
  faithful, hardcode project + module, run only the stage under test.
- Verify the run's invariants **against the emitted arrays**, not the agent's summary prose.
- Workflow-script changes do **not** touch `SKILL.md`/`references/` → no version bump, no publish.
  Only the published skill surface triggers the `dev-skills/.claude/CLAUDE.md` publishing flow.

## Candidates
- **Spec-level upward orphan check** — the active skill-development thread. Pass 7
  covers ADR→intent (every ADR decision traces back to a source intent); the
  spec→ADR/intent counterpart — does every spec clause trace back — is the natural
  extension if spec-level scope creep needs guarding. New SKILL content (version bump
  + `references/pass-notes.md` + publishing). Vocabulary grounded in
  `research/orphan-requirement-allocation-completeness.md`.
- **Further corpus experiments (optional, method-stress only)** — additional Agonara
  modules are worth running only for the new stress their *shape* puts on the method,
  not for coverage: **Assessment** 6/7 exercises dual ownership (one spec realizing
  both Corpus-side and Student-side of an ADR); **Student Workspace** exercises scale +
  async + 5-spec fan-out against the completeness invariant and the per-cluster split.
  Outputs are kept under the skill's `evals/traceability-reviews/` (no SKILL bump);
  evaluate the run, fold any wobble back into the skill, don't diff against a fixture.

## Parked
- **Publishing workflow** — when merging to trunk: `marketplace.json` + `plugin.json` bump, log entry, PR (per `dev-skills/.claude/CLAUDE.md`).
- **Hosting / triggering** — single vs multi agent; where it runs in anger.
- **CUR-13 refinement** — distinguish acceptance-time provenance from pre-acceptance visibility (the passes stably classify it allocated/carried; an arguable under-flag).
