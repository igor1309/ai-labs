---
date: 2026-04-30
model: claude-opus-4-7
description: "Strict grammars for the three JTBD artifact types and regex-style rejection patterns the skill applies before returning output."
---

# JTBD Grammars and Rejection Patterns

The three artifact types have distinct grammars. Mixing them is the single most
common incoherence in the wild. Apply these patterns *before* returning any
artifact.

## Job statement (Ulwick)

**Grammar:** `<verb> <object> <contextual clarifier>`

- `<verb>` is concrete and customer-facing. Reject vague verbs (`leverage`,
  `utilize`, `enable`, `optimize`) and product verbs (`use`, `access`, `click`,
  `tap`).
- `<object>` is owned by or relevant to the customer, not the company.
- `<contextual clarifier>` disambiguates *which* version of the job — usually a
  recipient, location, time, or condition.

Examples:
- `Pass on family memories to children.`
- `Get groceries from the store to the kitchen.`
- `Listen to music while driving.`

Rejection patterns:
- Contains a brand or product name → reject.
- Contains a technology or platform (`mobile app`, `web portal`, `AI model`)
  → reject.
- Contains `and` joining two distinct actions → split into two jobs.
- Verb is solution-flavored (`use`, `access`, `open`, `click`, `tap`, `swipe`)
  → reject; rewrite around what the customer is trying to *accomplish*.
- Reads as a goal of the company (`reduce churn`, `increase conversions`)
  → reject; restate as customer's job.

Litmus test: would this statement have been intelligible in 1950 and still
intelligible in 2050? If no, it has solution language smuggled in.

## Outcome statement (Ulwick / ODI)

**Grammar:** `<direction> <metric> <object of control> <contextual clarifier>`

- `<direction>` is `Minimize` or `Maximize`. No other verbs are valid.
- `<metric>` is a measurable quantity (time, frequency, likelihood, number of
  steps, cost, error rate). Not a feature.
- `<object of control>` is what the customer can affect — not what the company
  controls.
- `<contextual clarifier>` names the circumstance that scopes the outcome.

Examples:
- `Minimize the time it takes to get songs in the desired order for listening
  while driving.`
- `Minimize the likelihood of forgetting an item while assembling a grocery
  list.`
- `Maximize the number of memories preserved when transferring photos to a
  child's device.`

Rejection patterns:
- Direction is anything other than `Minimize` / `Maximize` → reject.
- Metric is not measurable (`improve`, `enhance`, `streamline`) → reject.
- Object of control is the company's, not the customer's (`our checkout
  funnel`) → reject.
- Outcome requires a specific product to exist (`time to load the dashboard`)
  → reject; this is a feature wishlist, not an outcome.
- Outcome name contains a brand or technology → reject.
- Statement contains `and` → split.

## Job story (Klement)

**Grammar:**
`When <situation>, I want to <motivation>, so I can <expected outcome>.`

- `<situation>` is concrete and external — time, place, trigger, prior event,
  or recurring circumstance. Never a persona or role.
- `<motivation>` is a verb-led intention in the customer's voice.
- `<expected outcome>` is a recognizable state the customer can verify, not a
  UI event.

Examples:
- `When I'm packing for a multi-day trip the night before an early flight, I
  want to be confident I haven't forgotten anything important, so I can sleep
  without anxiety.`
- `When a teammate sends me a long document right before a meeting, I want to
  get the key points fast, so I can show up prepared without skimming.`

Rejection patterns:
- Starts with `As a [role]` → reject; this is a user story, not a job story.
- `<situation>` describes a persona (`As a busy professional`) instead of a
  circumstance → reject.
- `<motivation>` is a feature request (`I want a button that…`) → reject;
  rewrite as the underlying intention.
- `<expected outcome>` is a UI event (`the modal closes`) → reject; rewrite as
  a customer-recognizable state.
- Brand, product name, or app verb anywhere in the story → reject.

## Cross-mode anti-patterns (always reject)

- A "job statement" that is actually a job-story situation (`When…`) → wrong
  grammar; pick a mode.
- A "job story" with embedded outcome direction (`Minimize`, `Maximize`)
  → wrong grammar; switch to `decompose` if the team needs metrics.
- An "outcome statement" without `Minimize` / `Maximize` → not an outcome.
- A "narrative job" with numeric importance/satisfaction columns → camp mix;
  rewrite the job as `verb + object + context` before scoring.
- Personas reintroduced in any artifact (`the busy mom`, `the millennial`,
  `the power user`) → reject; demographics are not causal in JTBD.
