---
title: The Intent Debt (Addy Osmani) — Summary and Implications for My Way
date: 2026-06-06
model: claude-opus-4
description: "Summary of Addy Osmani's 'The Intent Debt' essay and what it means for My Way."
author: Igor Malyarov
format: research
---

# The Intent Debt (Addy Osmani) — Summary and Implications for My Way

Summarized from the full essay text (June 5, 2026), supplied by the author.

## The essay

Storey's **Triple Debt Model**: technical debt lives in code, cognitive debt in
people (Osmani's "comprehension debt"), **intent debt in artifacts** — the
externalized goals, constraints, and rationale explaining *why* the system is the
way it is. The three are independent: code can be pristine and intent debt still
crippling.

The point that matters under AI is an asymmetry. Agents refactor technical debt,
and can re-explain code to restore comprehension — but **cannot generate intent,
only fabricate a plausible why**. The model can't tell whether a `300ms` debounce
was a UX decision, a benchmark, or a number typed once. "Code it can write.
Comprehension it can restore. The why it can only fabricate."

And it now compounds: agents start every session cold with no tacit memory, so
un-externalized intent — once paid at onboarding — is paid every session × every
agent. Paydown is one move: put the load-bearing why somewhere an agent can read
(spec for intent not implementation; AGENTS.md as intent ledger; lightweight ADRs;
a session-end learnings loop). "You can't capture all intent" is not a license to
capture none.

## What it means for My Way

Osmani's **independent debts are the *unmanaged* state** — intent floating free of
code. My Way's traceability chain (`intent → ADR → spec → test names`) is what
*re-couples* them: the why is carried forward with no loss, not left to evaporate.
That makes My Way a stronger answer than the essay's four loose remedies, which it
already runs — it *connects* what Osmani only lists.

So his remedies are not missing gates. My Way banks trust **at construction time**
(progressive disclosure, TDD, review-before-merge); it deliberately avoids the
late, large-context review that "could but would be flaky" at production scale. A
bolt-on comprehension gate would reintroduce exactly that.

**Honest borrow: vocabulary, not mechanism.** "Intent debt — the one debt an agent
can't repay" is a sharp one-line case for why the pre-coding phase exists.
