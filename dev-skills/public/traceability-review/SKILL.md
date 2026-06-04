---
name: traceability-review
description: >
  Use when the user explicitly asks for a "traceability review" or
  "consistency review" of a project's My-Way pipeline artifacts —
  intents, ADRs, specs, and tests. Checks that each node faithfully
  carries its upstream node forward with no loss and no contradiction
  (forward/backward requirements traceability), and that artifacts
  sharing a parent do not diverge. NOT for code-vs-documentation drift
  (use doc-drift-audit for that). The reviewer detects and suggests
  fixes; it never edits, PRs, merges, or closes anything.
version: "0.12.0"
author: Igor Malyarov
---

# Traceability Review

A requirements-traceability consistency review across a project's My-Way
pipeline (`intent → ADR → spec → tests`). The invariant: **no loss, no
contradiction** as each node carries its upstream node forward, and **no
divergence between artifacts that share a parent**. The ground truth for every
check is the **upstream node**, not the code — this is what distinguishes it
from doc-drift (whose ground truth is the code).

Treat any pass not marked *(implemented)* below as roadmap, not tested behavior.

## Precondition (topology)

The skill assumes the My-Way shape: a **role-decomposed intent layer** (a
product intent plus per-role user-story files), **module-decomposed ADRs**, and
a **module responsibility map** as the ownership substrate. A project without
that shape needs discovery adapted, not a drop-in run. `{{ARGS}}` = the target
project.

## The passes

1. **intent × intent** — internal consistency of the intent layer (horizontal:
   cross-role and inside-role). *(implemented)*
2. **intent → ADR** — every accepted intent carried into an ADR with no loss or
   contradiction; **plus vertical coverage** (every intent capability reflected
   downstream or explicitly deferred). Run **per module**. *(implemented)*
3. **ADR × ADR** — cross-module compatibility: no double ownership, no boundary
   violation, contracts consistent provider↔consumer, and no map-vs-ADR
   ownership drift. *(implemented)*
4. **allocation completeness** (cross-cutting) — every intent capability owned
   by ≥1 module; a capability owned by **no** module is *unallocated*.
   *(implemented)*
5. **ADR → spec** — per module; each ADR decision honoured by its spec. *(implemented)*
6. **spec ↔ tests** — per module; test **names** only (no bodies, don't run
   tests — a merged test is already green); every spec clause has a
   named test, every test name traces to a clause. *(implemented)*
7. **upward orphan check** — per module; the *upward* counterpart to allocation
   completeness. Every ADR decision must trace *back* to a source intent; one
   that introduces user-observable scope no intent requested — and that is not a
   design derivation of a traced decision — is an **orphan** (scope creep).
   *(implemented)*

("Unallocated" (pass 4) is the *downward* check — an intent capability with no
owner. "Orphan" (pass 7) is the *upward* check — an ADR decision with no intent
parent. Don't conflate them.)

**Per-pass mechanics** — each pass's row unit, verdict set, and false-positive
guards — are in `references/pass-notes.md`. Read the relevant section when
running a pass; the cross-cutting method below applies to all of them.

## How a pass works

Every pass is a **complete enumeration**, not an impression. This is the one
non-negotiable: list **every** item in scope (every story, every owned
responsibility, every capability) — one row each — and give each row a verdict
with evidence. **Completeness is load-bearing: incompleteness is precisely what
makes runs disagree, because each run otherwise scrutinises a different subset.**
Pin rows to the source artifacts' own units (e.g. one row per intent story, one
per responsibility-map `Owns` entry) — don't sub-split or invent finer rows, or
the counts wobble run-to-run.

Then **classify each row and derive findings from the classifications** — no
finding that isn't a row, no row without a verdict. The natural verdicts are
"faithfully carried / consistent", "explicitly deferred", "narrowed (a loss)",
"contradicted", "uncovered / unallocated". A finding is any row that isn't clean.

Scale to the right scope: per-module where the artifacts decompose by module
(intent→ADR, ADR→spec) so each run is small enough to *be* complete; whole-set
only where the unit is compact (the responsibility map for ADR×ADR). If a set
is too large to hold at once, split by clustered concern, not arbitrarily.

## Discipline

- **Evidence is mandatory.** Every finding quotes both sides with `file:line`
  and the artifact IDs. A clean result is valid and common — back it with the
  completed enumeration and cited interlocking evidence, never assert it.
- **Deferred ≠ finding.** An ADR deciding detail the intent left open, or
  explicitly deferring via a Non-Goal, is faithful. Only an *unacknowledged*
  loss/gap is a finding — deferring a capability's *shape* does not defer its
  *existence*. A row whose existence is carried but whose shape is deferred is
  `carried` with the deferral cited, not a separate verdict.
- **Suggest, never apply.** The reviewer proposes the minimum fix; it never
  edits, PRs, merges, closes, or opens issues. Output is the findings file.
- **Route what you can't resolve.** A tension the current layer can't settle is
  an **open question** tagged with the layer that likely resolves it — not a
  forced finding and not ambient doubt.
- **Factual only** — contradiction, loss, divergence, missing ownership. Never
  style, wording, or missing-feature wishes.

## Output

One Markdown file in `<project>/docs/traceability-reviews/`, named
`<UTC-timestamp>-<pass>.md`. Front-matter carries the AGENTS.md trio (`date`,
`model`, `description`) plus, for version comparison and provenance:
`skill`, `skill_version` (the version this ran under — it doubles as the agent
version), `scope` (pass + project), `mechanism` (the pass's method — matrix,
register, etc. — where it has one), and `inputs` (each reviewed file with its
document `version` or `status`, so a findings diff isolates skill change from
document change).

Body: a `Summary` (the enumeration count, verdict breakdown, finding total, and
a one-sentence verdict), the **complete enumeration** (the matrix/register — the
core auditable artifact), `Findings` (derived from the non-clean rows, full
evidence), `Open questions` (tagged), and `Inspected` (files, versions, the IDs
enumerated — so coverage is checkable).

## Umbrella ledger

A cross-cutting **aggregation** over the per-pass outputs — not a pass over source
artifacts. It rolls every pass's `Findings` and `Open questions` into one register
a human resolution session works from. Like every output it is a **generated,
provenance-stamped snapshot** (regenerated when passes re-run); it is *not* a
persistent tracker — disposition happens by editing source docs or filing
issues, and resolved items drop out of the next regen.

- **Input:** the current authoritative output per pass — exclude superseded or
  earlier runs (e.g. a whole-surface run replaced by per-module ones).
- **Enumerate completely:** one row per finding and one row per open question, in
  every aggregated output, pinned to `(pass, item-id)`. The ledger introduces **no
  new finding** — it only organizes what the passes already found.
- **Two derived views:** a deterministic **resolving-layer rollup** (group items by
  the layer that settles them — intent / map revision / spec / ADR — so the session
  sees what to decide where) and a **threads** view (group items that are the same
  underlying tension across passes; this is the judgement layer).

See `references/pass-notes.md` for the row columns and the link-don't-duplicate rule.

## Reuse

The **portable core** is this `SKILL.md` plus `references/pass-notes.md` — the
method, runnable on any project with the My-Way shape. The **project-bound** part
is everything stamped to one project: the reference outputs and any worked
example you keep under `<project>/docs/traceability-reviews/`.

- **A new project:** keep the core, start a fresh harness. If the project has no
  module responsibility map, adapt discovery first — the map is the ownership
  substrate that ADR×ADR, allocation, and the orphan check lean on; running them
  without it is running blind.
- **The same project, later:** the `inputs` document versions stamp every output.
  Re-run the pass, diff against the prior snapshot, and human-confirm whether a
  delta is a real document change or a regression — don't edit the skill to
  satisfy a stale prior output.
