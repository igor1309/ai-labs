---
title: The Intent Debt (Addy Osmani) — Summary and Implications for My Way
date: 2026-06-06
model: claude-opus-4
description: "Summary of Addy Osmani's 'The Intent Debt' essay and a gap analysis of My Way against it."
author: Igor Malyarov
format: research
---

# The Intent Debt (Addy Osmani) — Summary and Implications for My Way

## Purpose

Capture the argument of Addy Osmani's *The Intent Debt* (June 5, 2026) and use it
as a mirror for My Way: where the method already pays down intent debt, where it
leaks, and what is worth borrowing. This research exists to sharpen the next
conversation about whether My Way needs new layers, gates, or vocabulary.

## Source

Summarized from the full essay text supplied by the author. This is a first-hand
summary of the actual article, not a reconstruction. Direct phrasings from the
essay are quoted.

## Core thesis

> "Technical debt lives in your code. Cognitive debt lives in your head. Intent
> debt lives in the artifacts you never wrote — the goals, constraints and
> rationale that explain why the system is the way it is."

Intent debt is the one kind of debt **an agent cannot pay down for you**, and the
one agentic engineering makes most expensive.

## The Triple Debt Model (Margaret-Anne Storey)

Osmani builds on Margaret-Anne Storey's Triple Debt Model — three places debt can
live:

| Debt | Lives in | What it is |
|---|---|---|
| **Technical debt** | the code | Implementation choices that make the system harder to change. Announces itself — slow builds, fragile tests, dread touching one file. |
| **Cognitive debt** | people | Erosion of *shared understanding* — the gap between how much code exists and how much any human actually understands. This is what Osmani has been calling **comprehension debt**. Code can be pristine and cognitive debt still crippling. |
| **Intent debt** | artifacts | Absence or erosion of *externalized* rationale, goals, and constraints explaining why the system is the way it is — written down somewhere a teammate, a future you, or an agent can read. |

**Key, easily-missed point: the three are independent.** You can have low
technical debt and high intent debt. You can understand a system perfectly (no
cognitive debt *for you*) while its intent exists nowhere outside your skull
(enormous intent debt for everyone else). "They feel similar from the inside.
They are not the same bill." (This corrects a common second-hand framing of an
intent→cognitive→technical *causal chain* — Osmani's essay does not claim that;
it claims independence.)

## Why intent debt is the one agents can't help with

This is the essay's spine — the asymmetry across the three debts under AI:

- **Technical debt** is now cheaper to take on *and* to pay down — point an agent
  at a tangled module and it refactors.
- **Cognitive debt** is recoverable — if you don't understand a chunk, ask the
  agent to explain; the model reads the code back to you and rebuilds the lost
  mental model on demand.
- **Intent debt** is different. "An agent cannot generate intent, because intent
  is the one input that has to come from you." A model can *infer* a plausible
  rationale from the code, but a guess about intent is not the intent. It doesn't
  know whether a `300ms` debounce was a deliberate UX decision, a benchmark
  result, or a number someone typed once and never revisited — "it will happily
  invent a confident-sounding reason, which is worse than admitting it doesn't
  know."

> "Code it can write. Comprehension it can restore. The why it can only fabricate."

## Why agents make the un-written cost compound faster

Teams got away with high intent debt for years by carrying it in their heads and
each other's heads — new humans absorbed intent slowly (hallway conversations,
review comments, "we don't do it that way because of an incident in 2023"). The
senior engineer *was* the intent documentation: expensive, lossy, but it worked.

Agents break that model. "Bringing agents onto a team is like doubling its size
overnight with entirely junior people — junior people with no long-term memory."
An agent starts most sessions cold and carries none of the tacit intent. Whatever
isn't externalized into an artifact it can read, it simply doesn't have.

That changes the economics: un-externalized intent used to be a cost paid
occasionally (onboarding, when someone left). Now you pay it **every session,
multiplied by every agent you run**. Twenty parallel agents are twenty teammates
who never met you and will confidently fill any gap with a plausible guess. The
orchestration tax is partly an intent-debt tax.

## Complement to the comprehension-debt argument

Osmani previously argued detailed specs are not a complete answer: translating a
spec to code involves implicit decisions no spec fully captures, and "a spec
detailed enough to be the program is just the program in a slower language." He
still believes that. Intent debt is the complementary truth:

> "The fact that you can't capture all intent is not a license to capture none of
> it."

Capture at least the **load-bearing** decisions — the ones whose rationale would
be expensive to get wrong and that nobody can reconstruct later.

> "Comprehension debt: don't trust that the code is correct just because it
> exists. Intent debt: don't trust that the reason survives just because the code
> does. Code is the answer. Intent is the question the answer was supposed to be
> solving, and AI is brilliant at producing answers to questions you forgot to
> write down."

## What high intent debt looks like

Not friction — "a particular kind of helplessness":

- An agent "fixes" a bug by removing a guard clause, and nobody can say whether
  the guard was load-bearing or leftover, because the reason was never recorded.
- A behavior users depend on quietly changes in a refactor; review passed because
  the diff looked clean and tests were green — **but the tests encoded the
  previous behavior, not the intent**.
- "Why do these two services talk over a queue instead of a direct call?" —
  "an agent suggested it and it seemed fine." Intent debt with interest accruing.

## Paying it down: externalize intent as a first-class artifact

The move is always the same — take the intent out of your head and put it
somewhere an agent can read. Osmani's four practices:

1. **Write the spec for the intent, not the implementation.** Goals, constraints,
   non-negotiables, and an explicit definition of done (fast, accessible, secure,
   delightful — not just "functionally correct"). The spec carries the intent the
   code can't carry on its own.
2. **Treat AGENTS.md as your intent ledger, not your config** — "stop using
   /init." An auto-generated file describes what the code *is*; an intent file
   describes what the team *means*: conventions, the "we don't do it this way
   because…", constraints invisible in any single file. That is the part agents
   can't infer and most need.
3. **Capture decisions where they happen.** Lightweight ADRs / decision logs are
   "pure intent-debt paydown." Recording *why* at decision time is trivial;
   reconstructing it eight months later is enormous. Agents make logging cheaper
   than ever — no excuse left.
4. **Make the learning loop write intent back down.** Self-improving agents that
   update a learnings file at the end of a session are "an intent-debt pump
   running in reverse" — every recorded root cause, every "we tried X and it
   didn't work because Y" is intent that would otherwise live only in memory.

> "None of these are new tools. They're the discipline of refusing to let the why
> exist only in your head."

## The reframe

Code was scarce, so we optimized for writing it. AI made code cheap;
comprehension is recoverable; but intent must originate with a human and is the
thing we're worst at externalizing. "Technical debt makes your system hard to
change. Cognitive debt makes it hard to understand. Intent debt makes it hard to
know whether it's still doing what you wanted at all — and it's the only one of
the three your agents can't pay back for you." Write down the why.

## Implications for My Way

Read correctly, the essay is not a checklist to bolt onto My Way. It is a
description of the failure mode My Way is built to prevent, and an argument for
the exact stance the traceability work already takes. The naive reading — treat
Osmani's four remedies as missing gates and add them — misreads both the essay
and the method.

### The "independent debts" state is the *unmanaged* state

Osmani's sharpest claim, that the three debts are independent — "not the same
bill" — describes a codebase where intent floats free of code and comprehension.
That independence is the disease, not a law of nature. My Way's traceability chain
(`intent → ADR → spec → test names`) is precisely the mechanism that *re-couples*
the domains: the invariant — no loss, no contradiction, siblings don't diverge —
carries the why forward node by node instead of letting it evaporate into "the
artifacts you never wrote." Where Osmani's own remedies leave four loose practices
you *hope* stay in sync, My Way binds them into one progressively-disclosed chain.
That binding *is* the intent-debt paydown; My Way is a stronger answer than the
essay's prescriptions because it connects what Osmani can only list.

### Trust is banked at construction, not recovered by review

An earlier version of this analysis proposed review-shaped gates — a comprehension
check, a late learnings pass, re-loading context to re-verify intent. That fights
the method's grain and is withdrawn. The traceability stance is explicit: at
production scale a late review "could but would be flaky" because the context is
too large to re-examine reliably; trust is therefore banked *at construction time* —
progressive disclosure, TDD, review-before-merge on small diffs — so a later pass
never has to re-open the code. A bolt-on late gate reintroduces exactly the
large-context review the method exists to avoid. Consequently:

- A **cognitive-debt / "explain it back" gate** is misapplied. Human understanding
  is preserved incrementally as each small, reviewed step is built — not audited
  wholesale afterward. The method trusts the *process*, not a heroic final read.
- The **"tests encode behavior, not intent"** caution is already answered. In My
  Way test names are the *compressed interface* to the chain, not the carrier of
  intent. The why lives upstream (`Product Intent → ADR → spec`) and is kept from
  diverging by the traceability invariant — so green tests are never asked to
  stand in for intent; the linked chain is.

### Where My Way already pays it down

- **Intent-first by construction** — the chain starts at the user-facing *why*.
- **Rationale externalized and committed** — ADRs hold "why this over the
  alternatives," version-controlled, "not buried in chat logs": exactly Osmani's
  shared move, "somewhere an agent can read."
- **Decision logs and AGENTS.md-as-ledger** (remedies 2–3) are already present —
  the progressive-disclosure CLAUDE.md + `.agents/` rationale notes, plus
  coding-phase Log/Artifact.
- **Intent stays living** — the loop feeds implementation reality back up, fighting
  the *erosion* half of intent debt.

### What genuinely survives, framed inside the method

One narrow thing in Osmani is worth holding, as a question about the existing
chain rather than a new gate: the *load-bearing but sub-architectural* why — his
`300ms` debounce. A decision too small for an ADR yet too consequential to lose.
My Way reliably carries architectural intent (ADR) and behavioral intent
(spec/tests); the open question is whether such sub-ADR rationale has a dependable
home *within the chain already* (a spec note, the Log/Artifact stage, a code
comment) or can still slip through. This is a "where in the chain," not an
"add a gate."

### Net

Osmani validates My Way more than he challenges it. The essay is, at bottom, an
argument for trusting an intent-externalizing *process* over carrying intent in
your head — which is the traceability thesis itself. The honest borrow is
**vocabulary, not mechanism**: "intent debt" names what the chain pays down, and
"the one debt an agent can't repay" is a sharp one-line case for why the
pre-coding phase exists at all.

## Open questions

- Where in the existing chain does the **load-bearing but sub-ADR why** live (the
  `300ms`-debounce case) — a spec note, Log/Artifact, or code comment — and is
  that home dependable or still leaky?
- Is "intent debt" / "the one debt an agent can't repay" worth adopting as
  **framing vocabulary** in the elevator pitch and pre-coding rationale, *without*
  implying any new process step?
