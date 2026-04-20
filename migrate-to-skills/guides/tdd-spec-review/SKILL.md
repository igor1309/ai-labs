---
name: tdd-spec-review
description: Use when reviewing a TDD executable specification for clarity, completeness, and alignment with implementation-driving tests.
---

# Review Task: TDD Executable Specification

You are reviewing a TDD (Test-Driven Development) executable specification for a component. This spec will guide the implementation of this component.

## Your Task

Perform a comprehensive review of the attached specification document. Focus on identifying:

### 1. **TDD Alignment**
- Does the spec prescribe implementation details (bad) or describe behavior (good)?
- Are test names clear and executable without implementation hints?
- Does the spec allow design to emerge through tests?
- Are there any structural prescriptions that should be removed?

### 2. **Completeness & Consistency**
- Are all collaborator interactions consistently tested across all events?
- Do all events that change state have ServiceCode Resolution tests?
- Do all events that query selections have Selection Query Interaction tests?
- Is the test pattern consistent across sections (State Transitions → Selection Query → List Triangulation → ServiceCode Resolution)?
- Are there any missing test scenarios?

### 3. **Clarity & Precision**
- Is terminology used consistently throughout?
- Are section names and test names unambiguous?
- Do the test names clearly communicate what behavior is being verified?
- Are there vague phrases like "when applicable" that need clarification?
- Are notes and explanations in the right places?

### 4. **Requirements vs Implementation**
- Are requirements clearly separated from implementation details?
- Is it clear what's the reducer's responsibility vs the collaborator's responsibility?
- Are constraints properly documented?
- Is the default resolution logic appropriately placed (as collaborator's concern)?

### 5. **Redundancy & Contradictions**
- Are there any redundant statements?
- Do any sections contradict each other?
- Are concepts repeated unnecessarily?
- Could any sections be consolidated?

### 6. **Missing Elements**
- Are there critical behaviors not covered by tests?
- Are edge cases addressed?
- Are failure scenarios tested?
- Are there implicit assumptions that should be explicit?

### 7. **Test Organization**
- Is the grouping of tests logical?
- Are subsections properly used?
- Is it easy to find related tests?
- Would the test file structure emerging from this spec be maintainable?

## Output Format

Provide your review as:

1. **Summary**: Overall assessment (Ready / Needs Minor Fixes / Needs Major Revision)

2. **Critical Issues**: Show-stoppers that must be fixed before implementation

3. **Important Issues**: Significant problems that should be addressed

4. **Minor Issues**: Nice-to-haves and polish items

5. **Strengths**: What the spec does well

For each issue:
- Quote the relevant section with line numbers
- Explain the problem clearly
- Suggest a specific fix

## Context

This is a truly TDD specification - the team wants to discover design through tests, not implement a predetermined structure. The spec documents:
- **WHAT** behavior is required (good)
- **NOT HOW** to implement it (bad if present)

The component uses:
- Reducer pattern (state machine)
- Synchronous collaborators (queries and resolvers)
- Prefetched data (no async operations)

Be thorough, precise, and constructive in your feedback.
