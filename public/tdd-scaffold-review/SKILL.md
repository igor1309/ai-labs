---
name: tdd-scaffold-review
description: "Evaluates test name scaffolds for TDD readiness by determining if each test name provides enough specification clarity to write a failing test. Use when reviewing test scaffolds, evaluating executable specifications, or assessing whether test names clearly define testable behavior without implementation ambiguity."
version: "0.0.1"
author: Igor Malyarov
---

# TDD Scaffold Review

Evaluate whether test names serve as clear executable specifications for Test-Driven Development. **Approach this as a senior engineer writing failing tests**: can you write each RED test without inventing unspecified behavior?

## Core Evaluation Principle

A test name is **Ready** when you can write a failing test without guessing the intended behavior. This means understanding:
1. The preconditions/inputs
2. The observable outcome
3. Any error or edge handling implied
4. You can write the test without inventing unspecified behavior

A test name **Needs Clarification** when the intended behavior is ambiguous or underspecified.

## Evaluation Process

For each test name in the scaffold:

1. **Parse the test name** - Identify the method, assertion, and condition components
2. **Assess clarity** - Determine if you could write the RED test without inventing requirements
3. **Document decision** - Mark as Ready with clear preconditions/outcomes, or list minimal clarifying questions

## Output Format

Generate a Markdown report with this structure:

```markdown
## Summary
- Ready: <count>
- Needs Clarification: <count>

## Tests
For each test **in source order**:

### <Exact Test Name>
- Status: **Ready** | **Needs Clarification**
```

For **Ready** tests, add:
- Preconditions (bullet list of setup requirements)
- Expected Outcome (bullet list of observable assertions)

For **Needs Clarification** tests, add:
- Questions:
  1. <Specific, minimal question>
  2. <Another focused question>
- Any minimal assumptions derivable from the name (optional)

## Evaluation Guidelines

### Clear Enough (Ready)
Test names that specify:
- Concrete outcomes: `shouldReturnFalse`, `shouldThrowException`, `shouldIncreaseBy10`
- Specific conditions: `onNullInput`, `whenBalanceIsZero`, `afterTimeout`
- Measurable behavior: `shouldCompleteWithin5Seconds`, `shouldLogTwice`

### Too Vague (Needs Clarification)
Test names with:
- Ambiguous outcomes: `shouldWork`, `shouldHandleCorrectly`, `shouldBeGood`
- Unclear conditions: `onBadInput`, `whenInvalid` (without context)
- Non-observable qualities: `shouldBeEfficient`, `shouldBeFast`

### Keep Questions Surgical
- **Surgical** means precise, unambiguous, focused on one behavior
- **Minimal** means only what's necessary to remove ambiguity
- One behavior per question
- **Prefer domain terms from the test name; avoid introducing new terminology**
- Don't suggest redesigns - only ask what's needed to understand intent

### Common Patterns

**Method-Assertion-Condition**: `test_addFunds_shouldIncreaseBalance_onValidAmount`
- Method: addFunds
- Assertion: balance increases
- Condition: valid amount provided

**Method-Assertion**: `test_logout_shouldClearSession`
- Method: logout
- Assertion: session cleared
- Condition: (implicit - user logged in)

## References

For detailed examples of ready vs unclear test names:
- See [references/examples.md](references/examples.md) for pattern recognition

## Scope Notes

- Focus only on specification clarity, not implementation
- Don't critique naming style or conventions
- Don't suggest test improvements or alternatives
- Assess only what's written; if requirements are missing, **ask instead of inferring**
- Do not restate the whole spec; be concise and specific per test
