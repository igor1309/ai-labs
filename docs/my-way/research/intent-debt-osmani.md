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

In the essay's vocabulary, My Way is **largely an intent-debt-management method**:
intent-first chain, rationale externalized into committed artifacts, a loop that
keeps intent living. The useful question is where it still leaks.

### Where My Way already pays it down

- **Intent-first by construction.** The chain starts at Product Intent (the
  user-facing *why*), not technical uncertainty.
- **Rationale is externalized and committed.** ADRs record "why this over the
  alternatives," consequences, and non-goals; every artifact is version-
  controlled "inspectable, reviewable, and traceable — not buried in chat logs."
  This is exactly the four remedies' shared move — "somewhere an agent can read."
- **Decision logs already exist** (remedy 3). The coding-phase Log and Artifact
  stages are intent-debt paydown by another name.
- **AGENTS.md-as-ledger is partly in place** (remedy 2). The progressive-
  disclosure CLAUDE.md + `.agents/` rationale notes already lean toward "what the
  team means," not auto-generated config.
- **Intent stays living.** The loop feeds implementation reality back up to
  spec / ADR / Product Intent, resisting the *erosion* half of intent debt.

### Gaps worth closing

1. **Cognitive debt (human comprehension) is a separate bill My Way doesn't
   charge.** The essay's independence claim is the sharp one: externalizing intent
   into artifacts (which My Way does well) does *not* discharge cognitive debt.
   My Way has no gate that checks a *human still understands* the (often
   AI-generated) code — no "explain it back," no onboarding-readiness check.
   Borrow: a lightweight human-comprehension gate, distinct from artifact-
   conformance review.

2. **The learnings-loop / implicit-decision capture is passive.** Remedy 4 (a
   session-end learnings file that records "we tried X, it failed because Y") and
   the essay's "capture the load-bearing implicit decisions" map onto My Way's
   Artifact stage — but that stage is opportunistic ("when the knowledge is
   durable"). Borrow: make it *active* — at the end of a TDD slice, explicitly
   prompt "what did you decide that the spec didn't say, and why?" and route the
   answer to spec / ADR / learnings.

3. **Tests encode behavior, not intent.** Osmani's refactor symptom — "the tests
   never encoded the intent, only the previous behavior" — is a direct caution to
   My Way's *test-names-as-definition-of-done*. Test names pin behavior; they do
   not carry the *why*. The ADR/spec must hold the rationale, and the chain must
   not let green tests stand in for preserved intent. Borrow: make this explicit
   in the spec/test-naming guidance.

4. **Lite paths are where intent debt silently accrues.** The essay stresses the
   load-bearing *why* on small changes is exactly what evaporates. My Way's
   minor-feature and bug-fix paths collapse intent capture into a change note.
   Borrow: a minimal "why" floor even on lite paths, so the escape hatches don't
   become the leak.

5. **Intent isn't provably *loaded into the agent's context* at work time.** The
   essay's economics — you pay the un-written cost every session, per agent —
   implies the relevant intent artifact must actually reach the cold-starting
   agent, not merely exist in the repo. Borrow: wire the relevant ADR/spec/intent
   into the agent's working context, not just the filesystem.

6. **Vocabulary.** "Intent debt" and "cognitive debt" name the two adversaries My
   Way already fights. Borrow rhetorically: the elevator pitch / framing notes can
   state plainly that the method exists to keep intent debt and cognitive debt
   low — and that, of the three, intent debt is the one an agent can't repay.

### What not to borrow uncritically

Osmani's four remedies are well-aligned with My Way but lighter than what it
already runs (progressive commitment, separation of exploratory vs committed
documents, Product Intent as an explicit traceability anchor). Adopt the
**vocabulary** and the **people-facing gaps** (cognitive-debt gate, active
learnings capture, the tests-≠-intent caution), not the baseline prescriptions
My Way already exceeds.

## Open questions

- Should My Way add an explicit **cognitive-debt / human-comprehension gate**,
  distinct from artifact-conformance review?
- Should the **Artifact/Log stage become an active session-end learnings step**
  (remedy 4), rather than opportunistic?
- Should the spec / test-naming guidance state plainly that **test names encode
  behavior, not intent**, so green tests never stand in for preserved rationale?
- Do the **lite paths need a minimal "why" floor** to stop being the silent leak?
- Should intent artifacts be **provably loaded into the agent's context** at work
  time, not merely committed?
- Is "intent debt" worth adopting as **first-class My Way vocabulary** in the
  elevator pitch and framing notes?
