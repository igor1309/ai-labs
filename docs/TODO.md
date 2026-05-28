---
date: 2026-04-19
description: "Tracked initiatives for ai-labs"
---

# TODO

## 1. work on `my-way`
- see [Future Shape Of My Way](docs/my-way/future-shape.md)
- work on [skills](docs/my-way/skills) (mind existing skills!) & implementent [transition](docs/my-way/plans/transition-to-skills.md)

## 2. Move ai-labs local skills to dev-skills

Migrate local skills created in step 1 into the canonical dev-skills plugin. ai-labs then consumes them via auto-updating plugin instead of local copies.

## 3. Model the review-loop exit conditions in `my-way`

The elevator pitch says "every `=>` is a loop: create, review, pass gate, fix or step back" — but the gate model is unspecified. The review loop has multiple plausible exit conditions: no findings, budget exhausted, severity threshold reached, possibly more. Today's `process-gates` skill is binary pass/fail and does not cover this.

Open questions:
- Naming: "pass gate" is a placeholder; a better term may exist.
- Set of exit conditions: which are real, which are aspirational.
- Where it lives: extension to `process-gates`, a new skill, or a note in `my-way`.

Tracked as RFC: [#331](https://github.com/igor1309/ai-labs/issues/331).
