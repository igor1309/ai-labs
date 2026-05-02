---
name: tdd-essentials
description: Use when implementing a feature or bug fix under strict TDD rules with red, green, commit, and refactor checkpoints.
---

# Strict TDD Essentials

## 1. Core Protocol

### 1.0 Requirement Clarification
- Before any test, ensure requirements are unambiguous.
- Identify acceptance criteria and edge cases.
- If requirements are unclear, **stop and request clarification**.
- Decompose feature into discrete, testable behaviors.

### 1.1 Red – Write Tests First
- Write **one or several related failing tests for a single behavior** before any production code.
- Ensure tests fail for the **right reason** (missing functionality, not syntax/compilation errors).
- Do **not** write tests for future/independent behaviors yet.
- Ensure both test and production code **compile** – a non-compiling state is **not a valid red**.
- **Test independence**: Each test must be isolated and not depend on other tests' execution order or state.
- Use **triangulation** when implementation approach is unclear - write tests from different angles.
- Run tests and **confirm failure (red)**.
- If the test does **not fail as expected**, stop, find the reason, **and ask for clarification if unclear**.

### 1.2 Green – Minimal Implementation
- Implement the **smallest possible change** to make the current behavior's failing tests pass.
- Run all tests and confirm they **turn green**.
- Do not implement future behavior early.
- If implementation exceeds what tests require, **remove the excess**.

### 1.3 Commit
- Commit only after **all tests pass**.
- Each commit represents **one behavior**.
- Use clear, behavior-focused messages describing what was implemented or fixed.

### 1.4 Refactor
- Improve clarity, naming, and structure of both test and production code.
- Extract helpers and remove duplication.
- Run the full suite to confirm **tests stay green**.
- Commit or amend once stable.

### 1.5 Loop
- Repeat for every new behavior or case.
- Never skip red.
- Never refactor on red.
- If any step outcome is **unclear**, **pause and ask for clarification before continuing**.

---

## 2. Supporting Disciplines

### 2.1 Quality Gates
- Never leave code in a failing or non-compiling state.
- Validate both the **inner** (current behavior's tests) and **outer** (full suite) cycles before commit.
- Each test (or small related set) should naturally reveal the next requirement.
- Ensure tests are **fast** - slow feedback loops break TDD flow.

### 2.2 Implementation Standards
- Each commit is atomic – no partial features.
- Inline comments only for **non-obvious design choices**.
- Follow conventional commits; no emoji or shorthand.

### 2.3 Test Structure and Naming
- Tests describe observable behavior.
- Test names serve as living documentation.
- Prefer names that read like sentences:
  - Swift: `test_update_shouldDoThis_onThat`
  - Python: `test_update_should_do_this_on_that`
  - Java/Kotlin: `update_shouldDoThis_onThat`
  - JS/TS (Jest): `it('updates …')`
- Follow Arrange-Act-Assert pattern for test structure. Never write inline comments like "Given/When/Then".

### 2.4 Behavior-Driven Testing
- **Test behavior, not implementation** - focus on observable outcomes, not internal mechanics.
- Test public interfaces. Aim not to use `@testable`.
- Tests should survive refactoring of implementation details.
- Write **error/failure cases first**, then success.
- Use mocks/spies to isolate external dependencies.
- Verify call counts and parameters explicitly.
- Keep factory methods centralized for test data setup.

### 2.5 Memory and Safety
- Track all subjects for leaks (`trackForMemoryLeaks` in Swift).
- Include file/line for accurate error locations.
- Test long-lived objects for correct lifecycle management.

### 2.6 Test Design Guidance
- **Boolean/state coverage**: exercise **all boolean combinations** for critical branches.
- **Boundaries & limits**: test **min/max**, off-by-one, empty/one/two, overflow/underflow, and invalid inputs.
- **State-space exploration**: when inputs are combinatorial, use **systematic loops** (or table-driven tests) to cover the state space without duplication.
- **Order & idempotence**: test **ordering effects**, **retries**, and **idempotent** behavior where relevant.
- **Determinism**: randomize **test data values**, not behavior; seed randomness to keep runs reproducible.

### 2.7 Test Prioritization
- Start with simplest valuable test case.
- Progress from: simple → edge cases → error conditions → boundaries.
- Use triangulation for complex logic: approach from multiple angles.
- Defer optimization tests until behavior is correct.

---

## 3. Decision and Documentation Discipline
- Record *why* a specific implementation path was chosen if non-trivial.
- Use inline notes for effects and guards that are not self-evident.
- Never document the obvious; document reasoning.

---

## 4. Pragmatic Adaptations
- For exploratory/spike work: document intention to revisit with tests.
- For legacy code: write characterization tests before changes.
- For prototypes: flag as non-TDD with rationale.
- When deviating from strict TDD, explicitly note why in commit message.

---

## 5. Summary
Strict TDD means:  
**Red → Green → Commit → Refactor → Loop.**  
One behavior at a time, with one **or several** related failing tests defining scope, verified, committed, and improved.  
No skipped reds. No broken or non-compiling states. No untested code.  
Test behavior, not implementation. Maintain test independence.  
When uncertain, **ask for clarification before proceeding.**
