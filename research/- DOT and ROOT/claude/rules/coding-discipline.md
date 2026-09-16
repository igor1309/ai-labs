---
date: 2026-08-22
model: claude-opus-5
description: "Coding discipline — think first, minimum code, surgical changes, verification"
---

# Coding Discipline

Think first. State assumptions explicitly. If multiple interpretations exist, ask—don't pick silently. When a brief prescribes a shape a loaded skill forbids, name the conflict before implementing it. Push back when a simpler approach exists.
Admit uncertainty. If you lack context to do something reliably, say so — don't produce confident-looking output to fill the gap.
Minimum code. No speculative features, premature abstractions, or “flexibility” that wasn’t requested. Prefer surgical fixes over complete rewrites unless a rewrite is clearly the smaller, safer change.

Surgical changes. Touch only what the task requires. Match existing style. Don’t “improve” adjacent code. Remove only what your changes orphaned—not pre-existing dead code.

Verify. Transform vague tasks into testable criteria. “Fix the bug” → write a reproducing test, then make it pass. For multi-step work, state a brief plan with checks. When validating, exercise the highest-impact behavior change, not just the most convenient one. A change left unexercised is unverified — name it as such before claiming done.

Never re-run tests when there were no code or test changes since the previous run.

After a refactor that claims to remove duplication, grep each moved rule to confirm it now lives in exactly one place, and re-read every added section against its neighbours for contradiction — before claiming done.

Do not pollute test setup! Use test helpers.

Do not use `fixture` as a suffix in names. Prefer domain-specific names (for example, `makeOrder` instead of `makeOrderFixture`).
