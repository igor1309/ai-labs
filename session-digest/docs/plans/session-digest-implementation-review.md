---
date: 2026-04-26
model: gpt-5
description: "Adversarial review findings for the session-digest implementation plan."
---

# Adversarial Review: Session Digest Implementation Plan

## Scope

Reviewed `session-digest/docs/plans/session-digest-implementation.md` for architecture-plan drift, missing process gates, and implementation risks.

## Findings

### Finding 1: Prompt Loading Contradicts the Injection Boundary

- Verdict: warning.
- Priority: P2.
- Location: `session-digest/docs/plans/session-digest-implementation.md:194`.
- Why: Task 2 defines `MainDeps.fsLike` as the single composition-root filesystem injection point for the CLI, but Task 8 later instructs `agents.ts` to call `fs.readFileSync(...)` directly. That creates hidden production I/O outside the declared dependency boundary and makes prompt-loading failures harder to test or fake.
- Fix: Either explicitly carve out checked-in prompt templates as allowed static module resources, or add a prompt-loader function that receives an injected async `readFile` from `fsLike` and is wired through `cli.main` or `agents.buildAgent`.

### Finding 2: Task 7.5 Verification Can Pass With an Invalid Amendment

- Verdict: warning.
- Priority: P2.
- Location: `session-digest/docs/plans/session-digest-implementation.md:413`.
- Why: The amendment gate only checks file existence and a narrow `TBD` regex, but the task requires front matter and four explicit sections with binding answers. A malformed amendment with missing headings or vague prose can still pass the command.
- Fix: Make the gate check required headings and front matter fields explicitly, for example `rg '^date:|^model:|^description:|^## API observations|^## Section-extraction strategy decision|^## Fake-LLM strategy|^## Task 8 redraft required\?' session-digest/docs/plans/session-digest-architecture-amendment.md` plus the no-`TBD` check.

### Finding 3: Out-of-Scope Guardrail Is Named but Not Specified

- Verdict: warning.
- Priority: P2.
- Location: `session-digest/docs/plans/session-digest-implementation.md:73`.
- Why: The ADR traceability matrix lists an `out-of-scope guardrail` for surface and non-goals, but no task defines an enforceable test or review checklist for it. That is drift-prone because HTTP, watch mode, service deployment, and provider abstraction regressions are exactly the kind of scope creep ADR-001 forbids.
- Fix: Add a concrete Task 8 or final-check item, such as static checks for forbidden dependencies or files (`express`, `fastify`, `chokidar`, provider adapter modules) and a review checklist mapping each ADR non-goal to `not introduced`.
