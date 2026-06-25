---
name: Feature Synthesis – Cairana Product Landscape
description: Aggregate the per-product research reports into a neutral cross-product feature landscape — taxonomy, coverage matrix, and unique features — strictly from the cited reports, no new web research.
author: Igor Malyarov
date: 2026-06-25
model: claude-opus-4-8
version: 0.0.1
---

# Synthesis Prompt: Cross-Product Feature Landscape

Project-specific prompt. Concrete file paths are inlined below; to promote this
to a reusable prompt, strip the concrete references and replace them with
placeholders.

## Input

- Source reports: every `*.md` in `cairana/research/products/` **except** this
  prompt file and anything under `plans/`. Currently 6: `upheal.md`,
  `mentalyc.md`, `blueprint.md`, `eleos.md`, `jotpsych.md`, `oasys.md`.
- Each source is an evidence-only, cited product-research report in an 8-section
  format (overview, capabilities, workflow, technical notes, integrations,
  recent changes, stale/missing evidence, source appendix).

## Task

Aggregate the source reports into ONE neutral, higher-level feature landscape
across all covered products. The two things that matter most:

1. **What features each product has** (coverage across the set).
2. **What features are unique** to a single product.

Do not re-research products, do not add facts absent from the source reports,
and do not fetch the web. If a fact is not in the reports, treat it as absent —
not as an invitation to look it up.

This is a **neutral landscape**. Do not orient findings toward any target
product or strategy; cairana has no defined shape yet, so any such orientation
would be premature.

## Method

1. Read all source reports in full.
2. Derive a feature taxonomy (category -> sub-feature) from what the reports
   actually describe — not a pre-imposed checklist. Categories will likely
   include: session capture, note generation, note templates/formats, treatment
   planning & continuity, compliance/QA, billing/RCM, client engagement &
   portal, scheduling, integrations/EHR interop, API surface, supported
   platforms, security/compliance posture. Add or drop categories to fit the
   evidence.
3. Build a product x feature coverage matrix. Each cell is `present` / `partial`
   / `absent` / `unknown`, using the source report's own verified-vs-inferred
   marking. Never upgrade an inferred or missing item to `present`.
4. Identify unique features — capabilities present in exactly one product.

## Output format

Produce `cairana/research/feature-landscape.md` with this structure:

1. **Feature taxonomy** — the category tree you derived.
2. **Coverage matrix** — products as columns, features as rows; cells
   `present` / `partial` / `absent` / `unknown`.
3. **Unique features** — per product, the features only that product has. List
   them; do NOT analyze *why* they are unique. Where a unique feature looks
   worth a deeper later look, add a `flag: explore later` marker — flag only, no
   analysis now.
4. **Table-stakes vs differentiators** — features ~everyone has vs features only
   one or two have. *[interpretation — label this section as interpretation]*
5. **Whitespace & gaps** — capabilities thin or absent across the whole set, and
   places where multiple reports flagged missing or stale evidence in common.
   *[interpretation — label as interpretation]*
6. **Evidence-quality notes** — where coverage rests on self-reported vs verified
   claims; where source reports disagree with each other.
7. **Source map** — which source report (filename) each matrix row / unique
   feature traces back to.

## Constraints

- **Evidence-bound.** Every feature-fact traces to a source report; cite the
  report filename. Sections 1–2, 3 (the list itself), 6, and 7 are aggregation
  only.
- **Separate fact from interpretation.** Sections 4 and 5 are interpretation and
  MUST be labeled as such. Do not let interpretation leak into the matrix.
- **No new evidence.** No web research, no new vendors, no pricing / funding /
  positioning / competitor commentary beyond what feature-mapping requires.
- **Flag, don't dig.** When something merits deeper study (why a feature is
  unique, an apparent contradiction), mark it `flag: explore later` and move on.
- Tables over prose where they reduce length. Keep prose tight.

## Front matter for the output file

```yaml
---
date: 2026-06-25
model: {the model that runs this synthesis}
description: "Neutral cross-product feature landscape synthesized from the six cairana product-research reports"
---
```
