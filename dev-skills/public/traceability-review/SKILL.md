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
version: "0.3.0"
author: Igor Malyarov
---

# Traceability Review

Requirements-traceability consistency review across a project's My-Way
pipeline. The invariant is **no loss, no contradiction** as intent flows
into ADRs, ADRs into specs, and specs into tests — plus **no divergence
between artifacts that share a parent**. The ground truth for each check is
the **upstream node**, not the code. This is distinct from doc-drift, whose
ground truth is the code/repo state.

Validated so far on the `intent × intent`, `intent → ADR`, and `ADR × ADR`
layer-pairs against Agonara. The remaining layer-pairs are scoped below but not
yet exercised — treat them as the roadmap, not as tested behavior.

## Scope: layer-pairs

The pipeline is `intent → ADR → spec → tests`. Each review run targets one
layer-pair:

1. **intent × intent** — internal consistency of the intent layer:
   **horizontal** cross-role and inside-role consistency only. Vertical
   intent→story coverage is *not* checked here — it belongs to intent→ADR.
   *(implemented, v0.0.1)*
2. **intent → ADR** — every accepted intent is carried into an ADR with no
   loss or contradiction; an ADR that diverges from its source intent sends
   the question back to the intent (amend the intent, then re-derive the ADR).
   This pair also owns **vertical coverage**: every intent capability/story
   must be reflected downstream; a parent capability the decomposition does
   not carry is a coverage finding here, not at intent×intent.
   *(implemented per-module, v0.2.0 — see "intent → ADR" below)*
3. **ADR × ADR** — cross-ADR consistency, including **cross-module
   compatibility**: no double ownership, no boundary violation, and shared
   contracts described consistently by provider and every consumer. Anchor on
   the project's module responsibility map (Owns / Does Not Own / Key Boundary)
   and the contract ADRs.
   *(implemented, v0.3.0 — compatibility only; seam coverage is a separate pass)*
4. **ADR → spec** — per module; each ADR decision is honoured by its spec.
5. **spec ↔ tests** — per module. Read **test names only** (not bodies, not
   code) and map them against spec clauses: every spec behaviour has a named
   test, every test name traces to a spec clause. Do **not** run tests — on a
   trunk-only repo a merged test is a passing test. Implemented-plans are out
   of scope (they were scaffolding from spec to code).

## Scope axis

The axis changes down the pipeline, because the artifacts do:

- **Intent layer → role axis.** Intents are role-decomposed (a product intent
  plus per-role user-story files). Two slices: **cross-role** (stories of
  different roles that share a parent concern) and **inside-role** (stories
  within one role file).
- **ADR/spec layers → module axis.** ADRs and specs decompose by module, not
  role. Cross-module compatibility lives here, not at the intent layer —
  modules do not exist until ADR time.

## intent → ADR: per-module deterministic coverage matrix

Run this layer-pair **one module at a time**, not over the whole ADR set. A
whole-surface pass *samples* — each run scrutinises a different subset, so its
findings do not reproduce. Per-module scope plus a forced-complete matrix
removes that sampling variance (validated against Agonara: whole-surface runs
agreed on almost no findings; per-module matrix runs reliably surfaced the same
real defect).

ADRs carry no `source_intent` field, so the intent→ADR mapping is **inferred by
subject/module** — use the project's module responsibility map as the
authoritative owner index. For the module under review, read the intent layer
(upstream, source of truth), the module's governing ADR(s), and the
responsibility map (mapping aid, not a review target).

**The matrix is the primary mechanism — it, not impressions, drives findings:**

1. **Enumerate every intent capability the map assigns to this module.** Do not
   stop at the ones that catch your eye; completeness is the point.
2. **One row per capability**, each with an explicit **verdict** —
   `carried` | `deferred` | `uncovered` | `carried-with-loss` | `contradicted`
   — and **evidence**: the ADR `file:line` + quote that carries/defers it, or
   `none`.
3. **Findings are derived mechanically from the matrix** — no finding that is
   not a row, and no row without a verdict:
   - `contradicted` → fidelity finding (fail)
   - `carried-with-loss` → fidelity finding (warning); quote BOTH the intent
     commitment and the narrowing ADR passage
   - `uncovered` → coverage finding (warning)
   - `carried` / `deferred` → clean (a `deferred` row MUST cite the deferring
     ADR/intent line)

**Disposition rule (do not mislabel).** An ADR deciding implementation detail
the intent left open, or explicitly deferring via Non-Goals, is `carried` /
`deferred`, never a finding. But a capability **omitted from a closed
enumeration and not named in Non-Goals is a finding** — `carried-with-loss` if
the capability is partially present but narrowed, `uncovered` if wholly absent.
It is **not** `deferred` merely because *related* schema is deferred: deferring
a capability's *shape* does not defer its *existence*.

**Cross-module seams are out of scope here.** A capability that falls between
modules and that no single module owns is a *cross-module* coverage finding —
it belongs to the cross-module seam-coverage pass, not to any one per-module
pass.

## ADR × ADR: ownership matrix + contract register

The cross-module ("across") pass. It checks that the modules **fit together**,
working from the module responsibility map (the shared ownership substrate) and
every ADR's Decision / Rules / Boundaries / Non-Goals — **not** the intents
(that is intent→ADR). Two deterministic artifacts, completeness-first:

1. **Ownership matrix. One row per `Owns` entry in the responsibility map,
   verbatim — do not sub-split or invent finer responsibilities.** (Ad-hoc row
   granularity is what makes drift findings vary run-to-run; pinning the rows to
   the map's own entries stabilises the enumeration.) Each row: the map owner,
   the ADR(s) that actually decide it (`file:line`), and a **verdict** —
   `single-owner` | `double-ownership` | `map-adr-drift`.
2. **Cross-module contract register.** One row per contract a module provides
   and another consumes: contract, provider ADR (`file:line`), consumer ADR(s)
   (`file:line`), and a **verdict** — `consistent` | `inconsistent` |
   `boundary-violation`.

**Findings derive mechanically** — no finding that is not a row, no row without
a verdict: `double-ownership` / `inconsistent` / `boundary-violation` → finding
(fail for a hard contradiction); `map-adr-drift` → finding (warning; the
provisional map lags an accepted ADR). A clean result is valid and must be
backed by the completed matrix + register, not asserted.

A module consuming another's contract **through** the contract is not a
violation — only reaching past it into the provider's owned internals is.

**Out of scope here: *seam coverage*** — a capability owned by **no** module.
That needs the intent layer (to know what should be owned) and is a distinct
cross-module pass, not the compatibility check above. When a per-module
intent→ADR pass tags a seam for the cross-module layer, it means that
seam-coverage pass.

If the ADR set grows too large to hold at once, split by **clustered concern**
(identity/auth, membership, corpus/curation, assessment), not by module-pair —
ADRs already cluster and cross-reference that way.

## Discipline

- Report **factual contradiction or divergence only**. Never report style,
  wording polish, missing-feature wishes, or completeness gaps.
- **Evidence is mandatory.** Every finding quotes both contradicting passages
  with `file:line` for each side and the artifact IDs.
- **A clean result is valid and common.** Do not manufacture findings. Back a
  clean verdict with positive evidence (cite the interlocking passages) so the
  "clean" is auditable, not asserted.
- The reviewer **suggests but never applies.** No edits, no PRs, no merges, no
  closing. The suggested fix is advisory and is not the only valid resolution.
- The reviewer never opens issues or queue items. Output is the findings file.

## Open questions vs. findings

A tension that the current layer cannot resolve is an **open question**, not a
finding — and it is tagged with the layer that most likely resolves it (e.g.
"resolved at intent→ADR / ADR-006"). This routes the tension downstream
instead of leaving it as ambient doubt or forcing a false finding. Open
questions are candidates for a human resolution session; the reviewer does not
resolve them.

## Running it

Argument: `{{ARGS}}` = the target project (e.g. `agonara`).

The reviewer reads **only** the artifacts of the layer-pair under review and
nothing below it. For `intent × intent`, that is the project's intent layer:
the product-intent document plus the per-role user-story files. Enumerate
every artifact ID per file so coverage is auditable. Assumes the My-Way
intent-layer layout; if a project's layout differs, adapt discovery rather
than reading unrelated files.

## Finding format

Per finding:

- **Verdict:** fail | warning
- **What:** one-line statement of the contradiction
- **Why:** the principle that makes the two incompatible
- **Side A:** `file:line` + quoted passage + artifact ID
- **Side B:** `file:line` + quoted passage + artifact ID
- **Suggested fix:** the minimum advisory change; if it can only be resolved
  outside this layer, say so explicitly.

## Output

Write one Markdown file to `<project>/docs/traceability-reviews/` named
`<UTC-timestamp>-<layer-pair>.md` (e.g. `2026-06-03T1007Z-intent.md`). Valid
Markdown: one `#` title, `##` sections, real headers, `-`/`1.` lists.

Front-matter must carry the AGENTS.md trio (`date`, `model`, `description`)
plus, for version comparison and provenance:

- `skill: traceability-review`
- `skill_version:` — matches this skill's version (doubles as the agent version)
- `scope:` — the layer-pair and project
- `slices:` — the slices reviewed
- `inputs:` — each reviewed file with its document `version` (from the file's
  own front-matter), so a findings diff between two runs isolates skill change
  from document change

Body sections: `Summary` (counts per slice + one-sentence verdict),
one section per slice (findings or "No contradictions found." with positive
evidence), `Inspected` (files, versions, enumerated artifact IDs), and
`Open questions`. For `intent → ADR` (run per module): `Summary` (matrix row
count + verdict breakdown + finding totals), `Coverage matrix` (the complete
table — the core artifact), `Findings` (derived mechanically from the matrix),
`Open questions`, and `Inspected`. For `ADR × ADR`: `Summary`,
`Ownership matrix`, `Cross-module contract register`, `Findings`,
`Open questions`, and `Inspected`.
