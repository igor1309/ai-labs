---
date: 2026-06-12
author: Igor Malyarov
name: Define DoD
version: 0.1.0
type: prompt-snippet
usage: >
  Closure — paste the body below the front matter verbatim at the end of any
  task prompt; it binds to "the task above". No placeholders to fill.
---

## Definition of Done (completion gate)

Before starting work on the task above, define its Definition of Done, then
use it as the completion gate.

Define:

- Numbered criteria covering every requirement of the task — functional
  outcomes, quality constraints, edge cases / failure modes, delivered
  artifacts. Declare non-goals explicitly; omission excludes nothing.
- Each criterion is one observable outcome. No vague qualifiers ("works",
  "clean", "proper") anywhere — not in criteria, checks, or pass conditions.
- Each criterion has:
  - Check: an exact command, or an inspection of a named file or artifact,
    runnable by someone else with access to the repo and produced artifacts.
  - Expect: a specific observable value, output, or diff — never a judgment.
- If a requirement cannot be given such a check, do not drop it: list it
  under `Unverifiable`, with the reason.

Verify before claiming completion:

- Run every check. Mark each criterion PASS or FAIL — no partial states.
- Report evidence per criterion: command output, diff, or artifact path.
- Fix FAILs and re-verify. If a criterion still cannot pass, state the
  limitation explicitly instead of looping.
- Claim completion only when every criterion is PASS with evidence; report
  any remaining FAIL or `Unverifiable` items as open limitations.
