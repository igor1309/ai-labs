---
date: 2026-04-26
model: gpt-5
description: "Adversarial review findings for the session-digest implementation plan."
---

# Adversarial Review: Session Digest Implementation Plan

## Scope

Review findings for `session-digest/docs/plans/session-digest-implementation.md`.

## Findings

### Finding 1: Task 6/7 Require Successful CLI Before the Pipeline Exists

- Priority: P1.
- Location: `session-digest/docs/plans/session-digest-implementation.md:340`.
- Status: added.
- Finding: Task 6 and Task 7 ask for `cli.main` success-path assertions before config, digest assembly, and agent wiring are implemented. Under strict TDD this forces either placeholder product behavior or prematurely implementing Task 8 work.
- Fix: Split these into pure output tests now, then move CLI integration checks for no raw copy, front matter, stdout, and clock threading into Task 8 after the fake LLM path exists.

### Finding 2: Plan Is Missing the Required Execution Lock

- Priority: P1.
- Location: `session-digest/docs/plans/session-digest-implementation.md:85`.
- Status: added.
- Finding: The repo process-gates skill requires implementation plans to include explicit `Worktree required`, expected worktree, expected branch, and preflight checkbox fields, plus step closeout discipline. This plan has process gates, but not the mandatory execution-lock fields, so execution can start without proving the branch/worktree is correct.
- Fix: Add the required execution-lock fields and step closeout discipline before using the plan for implementation.

### Finding 3: Structured-Output Plan References Zod Without Declaring It

- Priority: P2.
- Location: `session-digest/docs/plans/session-digest-implementation.md:456`.
- Status: added.
- Finding: Task 8 suggests `withStructuredOutput(z.object(...))`, but Task 1's dependency list does not add `zod`. If the selected approach uses Zod directly, add it as an explicit dependency; otherwise make the JSON-parse fallback the planned path so implementation does not rely on a transitive package.
- Fix: Either add `zod` to the declared dependencies or revise Task 8 to use the JSON-parse fallback as the planned path.
