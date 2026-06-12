---
date: 2026-06-12
author: Igor Malyarov
name: Define DoD
version: 0.3.0
type: prompt-snippet
usage: >
  Closure — paste the body below the front matter verbatim at the end of any
  task prompt; it binds to "the task above". No placeholders to fill.
---

## Definition of Done (completion gate)

Before starting work on the task above, state its numbered Definition of
Done in your response; afterward change it only by noted additions. Every
task requirement — explicit or implied — must appear in exactly one of:
criteria, non-goals (only work the task does not request), or `Unverifiable`
(impossible to check even in principle — state why; inability to check right
now is a FAIL). A requirement in none of them is a FAIL; never drop one.

Each criterion is one observable outcome — no vague qualifiers ("works",
"clean", "proper") anywhere — with:

- Check: an exact command or named-artifact inspection, runnable by someone
  else with the produced artifacts (and repo, if any).
- Expect: a specific value, output, or diff — never a judgment.

Gate: run every check; mark each criterion PASS or FAIL (no partial states)
with evidence — output, diff, or artifact path. Fix FAILs and re-verify.
Claim completion only when every criterion is PASS; otherwise report the
work incomplete or blocked, naming the failing criteria. `Unverifiable`
items accompany completion only as explicitly listed limitations.
