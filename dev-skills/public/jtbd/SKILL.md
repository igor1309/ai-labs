---
name: jtbd
author: Igor Malyarov
version: "1.0.0"
description: >
  Apply Jobs-to-be-Done as a product-development framing. Three explicit modes:
  `discover` (Christensen/Moesta — switch interviews, forces of progress),
  `decompose` (Ulwick/ODI — job statements, job map, outcome statements,
  opportunity scores), and `frame` (Klement — job stories for the backlog).
  Activates when the user says "JTBD", "jobs to be done", "job statement",
  "job story", "switch interview", "forces of progress", "outcome statement",
  "opportunity score", "what job is the customer hiring this for", or asks for
  positioning/audience/scope decisions framed by JTBD. Hard-enforces grammars
  and refuses to silently mix the Christensen and Ulwick vocabularies.
allowed-tools: Read, Grep, Glob, WebSearch, WebFetch
---

# Jobs-to-be-Done

JTBD is **two distinct traditions**, not one framework. This skill keeps them in
separate modes so output stays coherent.

| Mode | Lens | Primary outputs | Use when |
|---|---|---|---|
| `discover` | Christensen / Moesta | Switch-interview guide, forces-of-progress diagram, job-as-progress narrative | Front of funnel: "What business are we in?", "Why do customers churn/switch?" |
| `decompose` | Ulwick / ODI | Job statement (verb+object+context), 8-step job map, outcome statements (direction+metric+object+context), opportunity scoring | Job is known; need to prioritize what to build/measure |
| `frame` | Klement | Job stories ("When… I want to… so I can…") | Feature-scoping; replacing user stories in the backlog |

The mode is in `$ARGUMENTS`. If empty, infer it from context using the table
above. If still ambiguous, ask the user **once** which mode they want — don't
guess.

## Hard rules (apply in every mode)

1. **No solution language in jobs or outcomes.** Reject any output that contains
   product names, brand names, technologies, or app verbs (`click`, `tap`,
   `swipe`, `use the [thing]`, `open the [thing]`). Litmus test: a real job
   would have made sense in 1950 and will still make sense in 2050.
2. **No demographics or personas as primitives.** Reject "the busy mom", "the
   millennial professional", "the power user". Demographics are not causal in
   JTBD. A job's executor is a real human in a real circumstance.
3. **No bundled jobs.** A statement containing `and` is usually two jobs. Split.
4. **One job per statement; one outcome per outcome statement.**
5. **Stay at one altitude.** "Be happy" is too high. "Press the power button" is
   too low. The right altitude is what one team can plausibly affect with one
   product.
6. **Never silently mix camps.** Do not apply Ulwick opportunity scoring to a
   Christensen-style narrative job. Do not write a "Klement job story" with
   Ulwick outcome grammar inside it. If a single artifact would require mixed
   vocabulary, stop and tell the user the camps must be separated.
7. **Interviews come before surveys.** Outcomes you score must come from
   language you heard in interviews — not from internal hypotheses.

See `references/grammars.md` for the regex-checkable grammars and
`references/pitfalls.md` for the full pitfall checklist to apply before
returning any artifact.

---

## Mode: `discover` (Christensen / Moesta)

Use this mode for qualitative discovery: switch interviews, forces of progress,
job-as-progress narratives, hire/fire reframing, redefining the competitive set.

### What you produce

- **Switch-interview question guide.** Timeline-anchored ("walk me through the
  day you bought it"), not satisfaction-anchored ("are you happy?"). Targets
  the moment of switch and reconstructs the four forces.
- **Forces-of-progress diagram.** Four labeled vectors with concrete quotes:
  - **Push** — frustration with the current situation.
  - **Pull** — attraction of the new solution.
  - **Anxiety** — fear of the new (will it work? will I look stupid?).
  - **Habit** — inertia of the present.
  A switch happens when **Push + Pull > Anxiety + Habit**.
- **Job-as-progress narrative.** One paragraph in customer language describing
  the struggling moment, the desired progress, and what was hired.
- **Hire/fire reframe.** What the customer fired (often a non-product: a habit,
  a spreadsheet, doing nothing) and why. Names the *real* competitive set.

### Rules specific to this mode

- Push is the engine, not pull. If you cannot articulate the push concretely,
  you do not yet understand the job — say so and gather more.
- Anxiety kills more deals than features win. Identify anxieties before
  proposing capability additions.
- The competitor is whatever the customer fired, even if it's not a product.
- Do **not** number outcomes or assign opportunity scores in this mode. That is
  Ulwick territory; using it here corrupts the narrative.

### Output checklist

- [ ] Push is named with a specific, situational frustration (not a feature gap).
- [ ] At least one anxiety is named.
- [ ] The fired alternative is identified and named honestly.
- [ ] Narrative contains zero product names, brand names, or app verbs.
- [ ] No opportunity scores; no Ulwick outcome grammar.

---

## Mode: `decompose` (Ulwick / ODI)

Use this mode when the job is already known at the right altitude and the user
needs prioritization input grounded in measurable outcomes.

### What you produce

- **Job statement.** Strict grammar: **verb + object + contextual clarifier**.
  No technology, no brand, no method.
  - Example: `Pass on family memories to children.`
  - Counter-example: `Use the photo-sharing app to send pictures.` (rejected)
- **Universal job map.** Up to 8 steps in order:
  `define → locate → prepare → confirm → execute → monitor → modify → conclude`.
  Underserved opportunities cluster in specific steps, so the map is the
  scaffold for outcome generation.
- **Outcome statements.** Strict grammar:
  **direction (`Minimize` | `Maximize`) + metric + object of control + context.**
  - Example: `Minimize the time it takes to get songs in the desired order for
    listening while driving.`
  - A real job decomposes into 50–150 such statements; for a working draft, aim
    for 15–30 covering the most underserved job-map steps and ask the user
    whether to expand.
- **Opportunity scores** (only when interview-grounded importance and
  satisfaction data exist).
  Formula: `Opportunity = Importance + max(Importance − Satisfaction, 0)`,
  on 1–10 scales.
  Bands: `>10` opportunity, `>15` strong, `>20` extreme.
  Stable distributions need ~180+ respondents.

### Rules specific to this mode

- Refuse to compute opportunity scores against a Christensen-style narrative
  job — the grammars are incompatible. Tell the user the job needs to be
  rewritten as `verb + object + context` first.
- Outcome statements must be measurable, controllable by the customer, and
  solution-free. If a metric requires a specific product to exist, it's a
  feature wishlist, not an outcome.
- Do not invent importance/satisfaction numbers. If the user has no survey
  data, produce the outcome list and stop. Mark the scoring step as
  "blocked: needs interview-grounded survey (n≥180)".

### Output checklist

- [ ] Job statement matches `verb + object + context`; no `and`; no brands.
- [ ] Job map covers the steps relevant to this job (skip irrelevant steps,
      don't pad).
- [ ] Every outcome matches `direction + metric + object + context`; one per line.
- [ ] No outcome contains a brand, technology, or method.
- [ ] If scoring: numbers are user-supplied (not invented), formula applied
      correctly, bands labeled.

---

## Mode: `frame` (Klement)

Use this mode at feature-scoping time, replacing persona-led user stories with
job stories.

### What you produce

- **Job stories.** Strict grammar:
  `When [situation], I want to [motivation], so I can [expected outcome].`
- One story per row of the backlog item. Multiple stories are fine for a single
  feature — each captures a different situation.

### Rules specific to this mode

- Situation is concrete and external (time, place, trigger, prior event), not
  a persona ("As a power user…" → reject).
- Motivation is a verb-led intention, not a feature request.
- Expected outcome is a state the customer can recognize, not a UI event.
- Do **not** decorate job stories with Ulwick outcome grammar. If the team
  needs measurable outcomes, switch to `decompose` mode.

### Output checklist

- [ ] Every story matches the `When … I want to … so I can …` pattern.
- [ ] No "As a [role]" framing anywhere.
- [ ] No product names or app verbs in `When` or `so I can` clauses.
- [ ] One job per story; split bundled stories.

---

## Procedure

1. Determine the mode from `$ARGUMENTS`. If empty, infer from the user's
   request using the table at the top. If still ambiguous, ask once.
2. Gather context the user has already provided. Read referenced docs/specs if
   the user pointed at them.
3. Produce the artifact for the selected mode using the strict grammar.
4. Run the **Output checklist** for that mode and the **Hard rules** above
   *before* returning. If any item fails, fix the artifact rather than
   apologizing for it.
5. If the user's request would require mixing camps in one artifact, stop and
   surface that explicitly — name which two modes are entangled and propose a
   split.

## When NOT to use this skill

JTBD does not help with:
- Pure-tech infrastructure decisions (DB choice, refactor scope) — there is no
  customer job at that layer.
- Pricing optimization (use willingness-to-pay / van Westendorp / conjoint).
- Visual-design and craft details (use heuristic / usability evaluation).
- Internal-team productivity tools where "the job" is genuinely solution-shaped.

If the request is one of these, say so and decline to force-fit a job
statement.

## References

- `references/grammars.md` — strict grammars for job statement, outcome
  statement, and job story; rejection patterns.
- `references/pitfalls.md` — full pitfall checklist with examples.
- `research/jtbd-synthesis.md` — synthesized brief on lineage, concepts,
  artifacts, decisions, pitfalls, and operating heuristics. Cited sources.
