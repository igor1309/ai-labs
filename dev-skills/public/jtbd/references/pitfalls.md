---
date: 2026-04-30
model: claude-opus-4-7
description: "Pitfall checklist applied before returning any JTBD artifact — what each pitfall looks like, why it's wrong, and how to fix it."
---

# JTBD Pitfall Checklist

Run this pass on every artifact before returning. Fix issues silently rather
than apologizing for them.

## 1. Solution-flavored job statements

**Looks like:** `Use our app to share photos faster.`
**Why wrong:** Embeds a brand and a method. The job is stable across
solutions; the statement isn't.
**Fix:** Strip brand and method. Restate around what the customer is trying to
accomplish. → `Share a moment with a distant relative quickly.`

## 2. Persona conflation

**Looks like:** `The busy mom wants…`, `As a power user, I want…`
**Why wrong:** Demographics and roles are not causal in JTBD. People with the
same demographics make opposite choices; people with the same job make similar
choices.
**Fix:** Replace persona with circumstance — *when, where, what just happened,
what they were trying to make progress on*.

## 3. Mixing camps in one artifact

**Looks like:** A narrative job ("She wanted to feel less alone in the
mornings") with a numbered outcome list and opportunity scores attached.
**Why wrong:** Christensen jobs are too coarse to score; Ulwick outcomes are
too granular to "hire" anything. The grammars are incompatible.
**Fix:** Split. Keep the narrative in `discover` mode; rewrite the job as
`verb + object + context` and re-derive outcomes in `decompose` mode if
scoring is needed.

## 4. Treating the switch interview as a survey

**Looks like:** A 5-question form asking "rate your satisfaction 1–10".
**Why wrong:** Switch interviews are timeline-anchored, conversational, ~60
minutes, one-on-one. Compressing them into a survey strips the causal signal.
The instrument *is* the discipline.
**Fix:** If the user wants a survey, point them at `decompose` mode and ODI
opportunity scoring. If they want causal "why people switch", insist on
interview format.

## 5. Wrong granularity

**Looks like (too high):** `Be happy.`
**Looks like (too low):** `Press the power button.`
**Why wrong:** Too high → unactionable. Too low → solutionized.
**Fix:** Pick the altitude where one team can plausibly affect the job with
one product. If the user's job is too high, ask for the specific situation; if
too low, ask what the customer is *ultimately* trying to accomplish.

## 6. Bundled jobs

**Looks like:** `Plan the trip and book the flights and pack the bags.`
**Why wrong:** Three jobs in one statement. Each will have a different
customer, context, and competitive set.
**Fix:** Split on `and`. Confirm each fragment is itself a complete job
statement.

## 7. Inventing the executor

**Looks like:** `The B2B Omni-Channel Growth Synergist wants to…`
**Why wrong:** That's a job title invented by marketing, not a human in a
circumstance. Generates Frankenstein workflows.
**Fix:** Name a real person doing a real activity in a real moment.

## 8. Confusing jobs with goals or pains

**Looks like:** `Reduce churn` (company goal). `Improve retention` (pain).
**Why wrong:** Both are framed from the company's perspective. JTBD is about
what the *customer* is trying to do, in their language.
**Fix:** Restate as the customer's job. *What is the customer doing such that
churning would be a sign of failure?*

## 9. Survey before interview

**Looks like:** A list of 50 outcomes the team wrote in a workshop, scored
against numbers nobody validated with users.
**Why wrong:** Outcomes you score must come from language you heard in
interviews. Otherwise you're scoring your own hypotheses.
**Fix:** Mark scoring as "blocked: needs interview-grounded outcomes". Produce
the outcome draft, but do not attach scores.

## 10. Vague verbs in job statements

**Looks like:** `Leverage assets to optimize outcomes.`
**Why wrong:** No verb the customer would say out loud. Reads like a strategy
deck.
**Fix:** Use a concrete verb the customer would actually use. `Pass on`, `get
to`, `keep track of`, `prepare for`, `share with`.

## 11. Anxiety-blind discovery

**Looks like:** A `discover`-mode artifact that lists push and pull but not
anxiety or habit.
**Why wrong:** Anxiety kills more deals than features win. A forces diagram
without anxiety is half-blind.
**Fix:** Probe explicitly for "what almost stopped you?" and add the
anxiety/habit vectors with concrete quotes.

## 12. UI-event "outcomes"

**Looks like:** `Maximize the smoothness of the checkout button animation.`
**Why wrong:** UI smoothness is not a customer outcome. The customer doesn't
have a job called "watch the animation."
**Fix:** Restate as something the customer can recognize as a state of the
world. `Minimize the time it takes to confirm an order is complete.`

---

## Quick rejection regex (mental model)

When reviewing your own draft, scan for these substrings — each is a likely
violation:

- `As a` (start of clause) → user-story framing, not job story
- `our app`, `our product`, brand names → solution language
- `click`, `tap`, `swipe`, `open`, `use the` → app verbs
- `and` (joining two actions in one statement) → bundled
- `improve`, `enhance`, `streamline`, `optimize`, `leverage` → vague verbs
- `the busy [X]`, `the [adj] [demographic]` → persona conflation
- `our funnel`, `our conversion`, `our retention` → company-perspective goal
- numeric scores attached to a narrative job → camp mix
