---
date: 2026-06-12
author: Igor Malyarov
name: Define DoD
version: 0.2.0
type: prompt-snippet
usage: >
  Closure — paste the body below the front matter verbatim at the end of any
  task prompt; it binds to "the task above". No placeholders to fill.
---

## Definition of Done (completion gate)

State the numbered Definition of Done for the task above in your response
before starting work; afterward change it only by adding criteria, noting
each addition. Use it as the completion gate.

Define:

- Numbered criteria covering every requirement of the task — functional
  outcomes, quality constraints, edge cases / failure modes, delivered
  artifacts. Every requirement must appear in exactly one of: criteria,
  non-goals, or `Unverifiable`; a requirement in none of them is a FAIL.
- Non-goals may name only work the task does not request; a non-goal that
  contradicts a stated requirement is invalid.
- Each criterion is one observable outcome. No vague qualifiers ("works",
  "clean", "proper") anywhere — not in criteria, checks, or pass conditions.
- Each criterion has:
  - Check: an exact command, or an inspection of a named file or artifact,
    runnable by someone else with access to the produced artifacts (and the
    repo, where one exists).
  - Expect: a specific observable value, output, or diff — never a judgment.
- `Unverifiable` is only for requirements no command or named-artifact
  inspection could verify even in principle; list each with the reason.
  Inability to run a check here and now is a FAIL, not `Unverifiable`.
  Never drop a requirement.

Verify before claiming completion:

- Run every check. Mark each criterion PASS or FAIL — no partial states.
- Report evidence per criterion: command output, diff, or artifact path.
- Fix FAILs and re-verify.
- Claim completion only when every criterion is PASS with evidence. If any
  criterion remains FAIL, report the work as incomplete or blocked, naming
  the failing criteria. `Unverifiable` items may accompany a completion
  claim only as explicitly listed limitations.
