---
date: 2026-04-26
model: gpt-5
description: "Adversarial review findings for the session-digest implementation plan."
---

# Session Digest Implementation Plan Review

## Scope

Reviewed `session-digest/docs/plans/session-digest-implementation.md` against the session-digest spec, ADR-001, repo process rules, and architecture-doc review criteria.

## Findings

### Finding 1: Live Smoke Can Write to Real Home

- Verdict: pass
- Priority: P1
- Location: `session-digest/docs/plans/session-digest-implementation.md:494`
- Problem: Step 1 says to read the user's real `~/.session-digests/.env` via `loadConfig`, but `loadConfig` is specified to create `.env.example` when `.env` is missing. That violates the same task's rule that live-test artifacts must never land under the user's actual `~/.session-digests/`.
- Fix: Read the real `.env` with a read-only helper or `dotenv.parse`, and forbid writes in credential discovery.
- Resolution: Resolved on 2026-04-26 by changing Task 9 to use a read-only `fs.readFile` + `dotenv.parse` helper for real-home credential discovery and keeping all CLI writes confined to an explicit temp `deps.baseDir`.

### Finding 2: Targeted Test Command Is Not a File Selector

- Verdict: fail
- Priority: P1
- Location: `session-digest/docs/plans/session-digest-implementation.md:74`
- Problem: The plan repeatedly uses `npm test -w session-digest -- --test-only tests/<file>`, but Node's `--test-only` means run tests marked `only`; it does not select a file. This makes the per-task verification command misleading or broken.
- Fix: Use `node --import tsx --test session-digest/tests/<file>.test.ts` for targeted runs, or change the workspace script so appended file paths are the only test inputs.
- Resolution: Resolved on 2026-04-26 by adding a `test:file` workspace script that delegates appended file paths to `node --import tsx --test`, replacing every targeted `--test-only` command, and keeping the full-suite gate on `npm test -w session-digest`.

### Finding 3: Strict TDD Instruction Conflicts with Batched REDs

- Verdict: resolved
- Priority: P2
- Location: `session-digest/docs/plans/session-digest-implementation.md:9`
- Problem: The plan tells executors to use `strict-tdd`, but each task lists multiple RED tests at once and Task 1 starts with scaffolding plus a passing bootstrap test instead of a failing assertion. `strict-tdd` requires one test at a time and a stop after RED.
- Fix: Either remove `strict-tdd` as the execution mode, or rewrite each task into one-test micro-steps with explicit RED stop gates.
- Resolution: Kept `strict-tdd`, carved Task 1 out as non-TDD harness setup, and made Task 2 onward treat every RED bullet as an independent one-test micro-step with an explicit RED stop gate.

### Finding 4: Source-of-Truth Rule Contradicts Support Tests

- Verdict: fail
- Priority: P2
- Location: `session-digest/docs/plans/session-digest-implementation.md:13`
- Problem: The plan says not to invent tests outside the spec envelope, but later adds many structural and supporting tests, and the done criteria explicitly include supporting tests. That creates permission ambiguity for executors.
- Fix: Reword line 13 to forbid new user-facing behavior while allowing implementation-safety tests, or remove the extra tests from the plan.
- Status: resolved on 2026-04-26 by rewording the source-of-truth rule to allow implementation-safety tests while forbidding new user-facing behavior outside the spec/ADR envelope.

### Finding 5: ADR Traceability Matrix Is Missing

- Verdict: warning
- Priority: P2
- Location: `session-digest/docs/plans/session-digest-implementation.md:60`
- Problem: ADR governance requires implementation plans derived from ADRs to map each ADR invariant to its implementation phase. The plan has an invariant list and spec test map, but no ADR traceability matrix.
- Fix: Add a matrix mapping ADR-001 Surface, Provider, Orchestration, Model tier, Input, Output, Output location, Persistence, Configuration, Privacy/retention, and Non-Goals to the responsible tasks and verification gates.
- Resolution: resolved in `session-digest/docs/plans/session-digest-implementation.md` by adding an ADR traceability matrix with task and verification-gate mappings for each listed ADR-001 concern.
