---
date: 2026-06-25
model: claude-opus-4-8
description: "Plan — fan out researcher sub-agents to run the product-research prompt for the 6 first-tier cairana startups, one report per company"
---

# Plan: Product-Research Fan-Out for First-Tier Startups

Run the [`product-research.md`](../../../../prompts/product-research.md) prompt
once per first-tier specialist startup using `researcher` sub-agents, saving one
evidence-only, cited report per company into `cairana/research/products/`.

On completion, move this plan to `cairana/research/products/plans/implemented/`.

## Scope

The 6 strongest evidence-backed specialist vendors from
[market-landscape.md](../market-landscape.md). The 2 weaker specialist startups
(Twofold, Supanote) and all incumbents/platforms are out of scope here.

## Rules

- Each agent runs the **full product-research prompt** with its Input block
  filled (Company + Product; family/use-case left blank).
- **Output format: the product-research prompt's 8-section format governs.** The
  researcher agent's citation contract (URL + title + access date,
  verified-vs-inferred, gaps) applies on top.
- Front matter on every report: `date: 2026-06-25`, `model: sonnet`,
  `description: …`.
- Evidence-only. No pricing/positioning/GTM/competitor analysis (per prompt's
  ignore list).
- Execution: **pilot one first** (Upheal), verify output shape, then fan out the
  remaining 5.

## Tracking

| # | Company | Product | File | Done |
|---|---|---|---|---|
| 1 | Upheal | Upheal | `cairana/research/products/upheal.md` | ☑ (pilot) |
| 2 | Mentalyc Inc. | Mentalyc | `cairana/research/products/mentalyc.md` | ☐ |
| 3 | Blueprint | Blueprint | `cairana/research/products/blueprint.md` | ☐ |
| 4 | Eleos Health | Eleos | `cairana/research/products/eleos.md` | ☐ |
| 5 | SmartScribe Corp. | JotPsych | `cairana/research/products/jotpsych.md` | ☐ |
| 6 | Oasys Health, Inc. | Oasys | `cairana/research/products/oasys.md` | ☐ |

## Out of scope

- Updating `cairana/docs/log.md` (deferred to later, per user).
- README Components table (research artifacts, not a new component).
- Twofold, Supanote, and all incumbent/platform vendors.
