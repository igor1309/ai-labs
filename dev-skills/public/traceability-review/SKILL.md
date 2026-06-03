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
version: "0.0.1"
author: Igor Malyarov
---

# Traceability Review

Requirements-traceability consistency review across a project's My-Way
pipeline. The invariant is **no loss, no contradiction** as intent flows
into ADRs, ADRs into specs, and specs into tests — plus **no divergence
between artifacts that share a parent**. The ground truth for each check is
the **upstream node**, not the code. This is distinct from doc-drift, whose
ground truth is the code/repo state.

Validated so far on the `intent × intent` layer-pair against Agonara. The
other layer-pairs are scoped below but not yet exercised — treat them as the
roadmap, not as tested behavior.

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
3. **ADR × ADR** — cross-ADR consistency, including **cross-module
   compatibility**: no double ownership, no boundary violation, and shared
   contracts described consistently by provider and every consumer. Anchor on
   the project's module responsibility map (Owns / Does Not Own / Key Boundary)
   and the contract ADRs.
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
`Open questions`.
