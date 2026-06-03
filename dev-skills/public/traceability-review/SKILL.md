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
version: "0.6.0"
author: Igor Malyarov
---

# Traceability Review

A requirements-traceability consistency review across a project's My-Way
pipeline (`intent → ADR → spec → tests`). The invariant: **no loss, no
contradiction** as each node carries its upstream node forward, and **no
divergence between artifacts that share a parent**. The ground truth for every
check is the **upstream node**, not the code — this is what distinguishes it
from doc-drift (whose ground truth is the code).

Validated across four passes (intent×intent, intent→ADR, ADR×ADR, allocation
completeness) — see `references/agonara-case-study.md` for the worked example.
Treat unimplemented passes below as roadmap, not tested behavior.

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
5. **ADR → spec** — per module; each ADR decision honoured by its spec. *(roadmap)*
6. **spec ↔ tests** — per module; test **names** only (no bodies, don't run
   tests — on a trunk-only repo a merged test passes); every spec clause has a
   named test, every test name traces to a clause. *(roadmap)*

(The upward "orphan" check — does every ADR/spec trace *back* to a source
intent — is a separate future pass; "unallocated" here is the *downward* check.)

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

## Pass-specific notes

- **intent × intent** is horizontal only; vertical intent→story coverage
  belongs to intent→ADR.
- **intent → ADR**: ADRs carry no `source_intent` field — infer the mapping by
  subject/module via the responsibility map. This pass owns vertical coverage.
- **ADR × ADR** works from the responsibility map + each ADR's
  Decision/Rules/Boundaries/Non-Goals (not the intents). Produce an ownership
  matrix and a cross-module contract register. A consumer using another's
  contract *through* the contract is fine; reaching past it into the provider's
  internals is a violation. Where the provisional map and an accepted ADR
  disagree on ownership, that's drift (a finding) — ADRs are authoritative.
- **allocation completeness**: read the full intent capability set + the map +
  every ADR (ADRs override the provisional map; a Non-Goal is the deferral
  authority). Before flagging a capability as owned-by-nobody, rule out the four
  false positives: it's **explicitly deferred**; it's **cross-cutting/NFR** with
  an owner at the architectural/ADR/system level (not necessarily a feature
  module); it has **≥1 owner** (multi-owner is fine — fire only at zero); or
  ownership is acknowledged-but-**pending** (an explicit TBD → a separate warning
  bucket). A record can be owned while its presentation/view is a downstream
  (spec) concern — that's allocated, with the view logged as an open question,
  not unallocated.

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
