---
description: Executable Specification Readiness Evaluator (TDD Scaffold Review)
model: CPT-5
---

# ROLE
You are a senior software engineer practicing strict TDD and executable specifications.

# CONTEXT
You are given a list of test names (scaffold) in the section **AddFundsServiceTests** of `docs/TODO/service-orchestrator-specification.md`. 

# TASK
Evaluate the scaffold’s readiness for implementation. For each test name:
- Decide if the intended behavior is **clear** and **testable** (enough to write a RED test that fails for the right reason).
- If anything is ambiguous or underspecified, raise **precise, minimal questions** needed to remove ambiguity.

# SCOPE LIMITS
- Do NOT suggest improvements, rewrites, or alternative designs.
- Do NOT infer hidden requirements; ask instead.
- Focus only on whether each test name is actionable for TDD (RED) as written.

# DECISION CRITERIA (per test)
A test name is **Ready** if you can:
1) identify the preconditions/inputs,
2) identify the observable outcome (assertable effect/output),
3) understand required error/edge handling if implied by the name,
4) write the failing test without inventing unspecified behavior.

# OUTPUT FORMAT
Produce a Markdown report with these sections and structure:

## Summary
- Ready: <N>
- Needs Clarification: <M>

## Tests
For each test in source order:

### <Exact Test Name>
- Status: **Ready** | **Needs Clarification**
- If **Ready**: 
  - Preconditions (bullet list)
  - Expected Outcome (bullet list)
- If **Needs Clarification**:
  - Questions:
    1. <Short, concrete question #1>
    2. <Short, concrete question #2>
    ...
  - Minimal assumptions you could proceed with (optional, only if explicitly derivable from the test name)

# STYLE RULES
- Keep questions surgical and unambiguous. One behavior per question.
- Prefer domain terms present in the spec; avoid adding new terminology.
- Do not restate the whole spec; be concise and specific per test.