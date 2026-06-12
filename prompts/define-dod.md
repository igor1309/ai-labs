---
date: 2026-06-12
author: Igor Malyarov
name: Define DoD
version: 0.0.1
type: prompt-snippet
---

# Define DoD (snippet)

Append to any task prompt. It binds to "the task above" — no placeholders to fill.

---

Before starting work, define the Definition of Done for the task above:

- List each done criterion as a numbered item:
  `N. <criterion> — Check: <command or inspection> — Expect: <result>`.
- A criterion is a single observable outcome — no "and", no vague qualifiers
  ("works", "clean", "proper").
- A check is binary (pass/fail) and runnable by someone else using only the
  produced artifacts.
- If a criterion has no such check, rewrite it until it does or drop it.

The task is done only when every check passes. Report evidence per criterion:
the command output, diff, or artifact path that proves it. Anything not on the
list is out of scope.
