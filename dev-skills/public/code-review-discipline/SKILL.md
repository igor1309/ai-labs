---
name: code-review-discipline
description: Use before declaring any implementation complete or reporting results (self-review is unprompted), when reviewing a diff or someone else's code, before writing down any fail/warning finding, and when turning review findings into an implementation plan. Triggers on "review the diff", "self-review", "review this code", "adversarial review", "before I call this done", "is this a finding", "fail/warning", "regression risk", "test seam", "plan from the findings".
allowed-tools: Read, Bash, Grep, Glob
author: Igor Malyarov
version: "1.0.0"
---

# Review

## Self-review before "done"

Adversarially review your own diff before declaring an implementation complete or
reporting results — do not wait to be asked. Read the diff as a hostile reviewer
would: test determinism, test-owned stubs vs production statics, helper
placement, seams dropped or narrowed, behavior changes leaking beyond the
intended surface.

**Name the other instances.** When a fix changes one instance of a shared pattern
(an OTP wiring, a cache lookup, a layout switch), check where else the pattern
lives and record whether the same defect class applies there — fix it, or defer
explicitly, never silently.

## Scope

Review only changed/added code — don't flag pre-existing issues. Match review
depth to change size: a one-line fix needs a quick sanity check, not a full
architecture review.

## For each finding

- State the **verdict**: pass / fail / warning
- Explain **why** it's a problem (link to a rule or a general principle)
- Reference the exact location as `file:line`
- Provide a **fix**: concrete code or steps, not vague advice
- If the fix requires new or updated tests, describe them

## Evidence bar for fail/warning

- Every fail/warning must cite a written rule (a skill, `.claude/AGENTS.md`, or
  lint) or a same-directory/sibling precedent. State the citation in the finding.
- A naming or structure preference with neither is a comment at most — not a
  finding. Do not relabel taste as a "general principle."
- Prove the finding's premise from a specification, contract, lint, changed
  behavior, or direct repository precedent. The current implementation alone does
  not prove contractual ownership or intended permanence.
- Before acting on a finding from a read-through, re-derive its premise from the
  current files, searching the whole scope the rule governs — not the part you
  have open.
- Identify whether the code is final behavior or explicit WIP/scaffolding.
  Respect stated unavailable APIs/designs and distinguish intentional stops from
  defects.
- Evaluate the proposed fix's regression risk, including whether it narrows or
  removes an existing test seam. State how testability changes before and after
  the fix.
- When evidence is ambiguous or cuts both ways — siblings strip a suffix but the
  wider codebase keeps it — that ambiguity is itself a reason to leave the code
  alone or ask for the missing contract, not to impose a preference.

## Grounding

- Grade against the repository's own declared standards (CLAUDE.md, rules,
  skills) before generic norms; cite the specific repo rule each finding
  violates.
- Pull `git log --oneline -- <scope>` and treat fix-commit history as the map of
  where risk lives; a test suite that avoids the bug-history hotspots is itself a
  finding.

## Implementation plans from review findings

- Include the full review as the first section — it is the source of truth.
- Split into steps ordered by dependency. Each step addresses one review finding
  (or one cohesive part of a finding), ends with a targeted test run and a
  commit. Steps must not bundle unrelated changes.
- The plan must be self-contained: a coder with access to the repo and AGENTS.md
  should need nothing else to execute it.
