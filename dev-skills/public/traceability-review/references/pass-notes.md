---
date: 2026-06-03
model: claude-opus-4-8
description: "Per-pass mechanics for the traceability-review skill — the row unit, verdict set, and false-positive guards unique to each pass"
---

# Traceability Review — Pass Notes

The mechanics unique to each pass: its **row unit**, its **verdict set**, and the
**false-positive guards** that pass needs. The cross-cutting method — complete
enumeration, pinning rows to the source's own units, classify-then-derive-
findings, mandatory evidence, deferred ≠ finding, suggest-never-apply, and
routing what you can't resolve to a tagged open question — lives in `SKILL.md`
and is **not** repeated here. Read the relevant section when running a pass.

## intent × intent

Horizontal only — cross-role and inside-role consistency of the intent layer.
Vertical intent→story coverage belongs to intent→ADR, not here.

## intent → ADR

ADRs carry no `source_intent` field — infer the mapping by subject/module via the
responsibility map. This pass owns **vertical coverage**: every intent capability
reflected downstream or explicitly deferred.

## ADR × ADR

Works from the responsibility map + each ADR's Decision/Rules/Boundaries/Non-Goals
(not the intents). Produce two artifacts: an **ownership matrix** (one row per map
`Owns` entry) and a **cross-module contract register**. A consumer using another
module's contract *through* the contract is fine; reaching past it into the
provider's internals is a boundary violation. Where the provisional map and an
accepted ADR disagree on ownership, that's drift (a finding) — ADRs are
authoritative.

## allocation completeness

Read the full intent capability set + the map + every ADR (ADRs override the
provisional map; a Non-Goal is the deferral authority). Before flagging a
capability owned-by-nobody, rule out four false positives: **explicitly deferred**;
**cross-cutting/NFR** with an owner at the architectural/ADR/system level (not
necessarily a feature module); **≥1 owner** (multi-owner is fine — fire only at
zero); **acknowledged-but-pending** (an explicit TBD → a separate warning bucket).
A record can be owned while its presentation/view is a downstream (spec) concern —
that's allocated, with the view logged as an open question.

## ADR → spec

The ADR is upstream; the spec must honour it. One row per ADR decision/rule/
invariant (pinned to the ADR's Decision/Rules entries). Verdicts: `honoured` (cite
`spec-file:line`), `contradicted`, `missing`, `deferred`. A spec narrower than the
ADR is `deferred` — **not** `missing` — only when an ADR Non-Goal or first-slice
scoping line authorizes the narrowing; cite that line and route the unrealized
scope as an open question for the later slice.

## spec ↔ tests

Bidirectional coverage between spec clauses and test *names*. **Titles only** —
extract `describe`/`it`/`test` strings by `grep`, never read bodies — and **do not
run tests** (where the repo merges only green tests, a merged test is already
passing). **Discover the test scope:** a module's clauses are tested across several
layers (domain, transport, persistence, acceptance — whatever the suite uses), so
grep titles across the whole suite and map by behaviour rather than a hand-listed
file set. Forward: every spec clause needs a named test (else `untested` →
warning). Backward: every test name traces to a clause (`orphan` → warning); titles
for other modules are `out-of-scope`, not orphan; a too-vague title — or a
negative/"does-not" guarantee that no test names (names-only can't confirm an
*absence*) — is an open question, not a forced verdict. Use `grep`, not a written
extraction script (measured: a script adds authoring + run cost and pushes the
whole suite through context, with no accuracy gain for names-only extraction).

## upward orphan check

The ADR is downstream here, the intent upstream — the reverse of intent→ADR. One
row per ADR **Decision sentence and Rules/Invariants bullet**, pinned to the ADR's
own units — **one row per bullet exactly as written**. Do **not** enumerate
Executive Summary, Context, Consequences, or Non-Goals as rows; do **not**
sub-split a bullet; do **not** promote an Executive-Summary restatement into its
own row; and do **not** fold or merge bullets — *not even several that share one
parent decision* (folding is the main source of count drift). (ADR decisions carry
no stable IDs the way intent stories do, so this unit is softer than an ID-pinned
pass — report the count as approximate even after applying these guards.) Verdicts: `traced` (cite the intent
`ID file:line`), `derived` (no direct intent parent but a legitimate design/
architectural derivation of a traced decision or system-level need — cite the
parent; a "derived requirement" is **not** an orphan), `carried-shape` (elaborates
the shape of a capability the intent left open — faithful, not scope creep), or
`ORPHAN` (a finding: user-observable scope no intent requested **and** not a
derivation **and** not an intent-left-open elaboration — gold-plating). The
**derived-vs-ORPHAN** call is the one residual judgement; be conservative — when
unsure, route it as an open question tagged `(resolving layer: intent)`, not a
forced ORPHAN.
