---
date: 2026-08-07
model: unknown
description: "Definition of Done gate — state numbered criteria with runnable checks before starting, and mark every one PASS or FAIL before claiming completion"
---

# Definition of Done Gate

Apply to substantive tasks — those producing artifacts, code, or a decision; skip
trivial Q&A.

Before starting work on the task, state its numbered Definition of Done in your
response; afterward change it only by noted additions. Every task requirement —
explicit or implied — must appear in exactly one of: criteria, non-goals (only
work the task does not request), or `Unverifiable` (impossible to check even in
principle — state why; inability to check right now is a FAIL). A requirement in
none of them is a FAIL; never drop one.

Obligations that the verdict is *derived from* — collecting sources, reading
material, recording evidence — are unconditional. They precede the verdict and
hold whatever it turns out to be. A definition of done that files them under a
success branch lets a failing run skip the very work that would have changed its
verdict.

Each criterion is one observable outcome — no vague qualifiers ("works", "clean",
"proper") anywhere — with:

- Check: an exact command or named-artifact inspection that fails when the
  criterion is false, runnable by someone else with the produced artifacts (and
  repo, if any).
- Expect: a specific value, output, or diff — never a judgment.

At authoring time, dry-run each Check against current state; a Check that
cannot execute today (missing environment, stale fixture, dead tooling) must be
re-scoped or flagged as at-risk before approval. A grep Check over prose must
survive line wrapping: match a phrase short enough that it cannot straddle a
break, or normalize whitespace first.

A claimed property of the artifact *as a whole* — ordering, coherence,
completeness, "no other instances" — needs its own falsifying check, not merely
per-item checks. State the command that would fail if the property did not hold;
if no such command exists, the property is an assumption, not a criterion.

Gate: run every check; mark each criterion PASS or FAIL (no partial states) with
evidence — output, diff, or artifact path. Fix FAILs and re-verify. Claim
completion only when every criterion is PASS; otherwise report the work
incomplete or blocked, naming the failing criteria. `Unverifiable` items
accompany completion only as explicitly listed limitations.
