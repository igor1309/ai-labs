---
title: TDD Quality Standards
description: Code quality and testing standards that apply to all TDD workflows
source: Adapted from /Users/igormalyarov/dev/ai-coder/guides/tdd-essentials.md
applies-to: tdd-interactive and other TDD workflows
version: 1.2.0
---

# TDD Quality Standards

This document defines code quality and testing standards that complement TDD workflows. These standards apply regardless of which TDD workflow you're following.

---

## 1. Quality Gates

- Never leave code in a failing or non-compiling state.
- Validate both the **inner** (current behavior's tests) and **outer** (full suite) cycles before commit.
- Each test should naturally reveal the next requirement.
- Ensure tests are **fast** - slow feedback loops break TDD flow.
- **Test independence**: Each test must be isolated and not depend on other tests' execution order or state.

---

## 2. Implementation Standards

- Each commit is atomic – no partial features.
- Inline comments only for **non-obvious design choices**.
- Follow conventional commits; no emoji or shorthand.
- Never document the obvious; document reasoning.
- **Never provide default empty closures in public initializers** - require callers to explicitly provide closure implementations.
- **Use tuple destructuring for related variable declarations** - Prefer `let (oldCountry, newCountry) = (makeCountry("old"), makeCountry("new"))` over separate `let` statements.

---

## 3. Test Structure and Naming

- Tests describe observable behavior.
- Test names serve as living documentation.
- Prefer names that read like sentences:
  - Swift: `test_operation_shouldBehavior_whenCondition`
  - Python: `test_operation_should_behavior_when_condition`
  - Java/Kotlin: `operation_shouldBehavior_whenCondition`
  - JS/TS (Jest): `it('operation should behavior when condition')`
- Follow Arrange-Act-Assert pattern for test structure. **Never write inline comments like "Given/When/Then", "Setup/Action/Assert", or similar.**

---

## 4. Behavior-Driven Testing

- **Test behavior, not implementation** - focus on observable outcomes, not internal mechanics.
- Test public interfaces. Aim not to use `@testable` (Swift) or similar test-only access modifiers.
- Tests should survive refactoring of implementation details.
- Write **error/failure cases first**, then success.
- Use mocks/spies to isolate external dependencies.
- Verify call counts and parameters explicitly.
- Keep factory methods centralized for test data setup.
- Use **triangulation** when implementation approach is unclear - write tests from different angles.

---

## 5. Memory and Safety

- Track all subjects for leaks (`trackForMemoryLeaks` in Swift, similar patterns in other languages).
- Include file/line for accurate error locations.
- Test long-lived objects for correct lifecycle management.

---

## 6. Test Design Guidance

### Coverage Patterns

- **Boolean/state coverage**: Exercise **all boolean combinations** for critical branches.
- **Boundaries & limits**: Test **min/max**, off-by-one, empty/one/two, overflow/underflow, and invalid inputs.
- **State-space exploration**: When inputs are combinatorial, use **systematic loops** (or table-driven tests) to cover the state space without duplication.
- **Order & idempotence**: Test **ordering effects**, **retries**, and **idempotent** behavior where relevant.
- **Determinism**: Randomize **test data values**, not behavior; seed randomness to keep runs reproducible.

### Test Prioritization

- Start with simplest valuable test case.
- Progress from: simple → edge cases → error conditions → boundaries.
- Use triangulation for complex logic: approach from multiple angles.
- Defer optimization tests until behavior is correct.

---

## 7. Adaptive Discovery During TDD

While following a prepared executable specification is ideal, remain open to discoveries during the TDD process:

- **Edge cases not in spec**: Add tests for edge cases discovered during implementation.
- **Missing behaviors**: If the specification is incomplete, add necessary test cases to the specification before implementing.
- **Refactoring opportunities**: The specification may not cover internal quality improvements.
- **Boundary conditions**: Mathematical or logical boundaries may become apparent only during implementation.

**When you discover missing test cases:**
1. Add them to the specification/test list
2. Discuss with reviewer if appropriate
3. Follow the normal TDD cycle for each new test

This adaptive approach balances upfront planning with empirical learning.

---

## 8. Pragmatic Adaptations

- For exploratory/spike work: document intention to revisit with tests.
- For legacy code: write characterization tests before changes.
- For prototypes: flag as non-TDD with rationale.
- When deviating from strict TDD, explicitly note why in commit message.

---

## Summary

These standards ensure:
- **Quality**: Fast, independent, focused tests
- **Clarity**: Behavior-focused naming and structure
- **Safety**: Memory management and lifecycle testing
- **Coverage**: Systematic exploration of state space
- **Maintainability**: Tests survive refactoring
- **Adaptability**: Balance planning with discovery

Apply these standards consistently across all TDD workflows for predictable, high-quality outcomes.
