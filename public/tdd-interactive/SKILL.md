---
name: tdd-interactive
description: "Interactive Test-Driven Development workflow with reviewer-in-the-loop. Implements the RED-GREEN-REFACTOR cycle with two mandatory verification gates where a reviewer (human or AI) approves work before progression. Applies to any code development that follows test-first methodology: features, bug fixes, refactoring, or enhancements. Invoked when TDD discipline with step-by-step verification is required."
version: "2.0.2"
author: Igor Malyarov
---

# TDD Interactive

## Overview

This skill implements Test-Driven Development through an **interactive, reviewer-approved workflow** with two mandatory verification gates. A **reviewer** (human senior engineer or AI verifier) validates work at critical checkpoints, enabling **incremental, verified development**.

This workflow requires test infrastructure and reviewer availability for verification gates.

**Workflow structure:**
- **Executing agent**: Performs TDD implementation work
- **Reviewer**: Validates and approves at verification gates
- **Process**: Five-phase cycle (RED → GREEN → COMMIT → REFACTOR → REFACTOR_COMMIT) with stops at RED and REFACTOR

## The Sacred Cycle

**RED → [STOP #1] → GREEN → COMMIT → REFACTOR → [STOP #2] → REFACTOR_COMMIT**

The cycle enforces discipline through two mandatory verification gates:
1. **STOP #1 at RED** - Present failing test to reviewer and wait for approval to proceed to GREEN
2. **STOP #2 after REFACTOR** - Present refactored code to reviewer, process feedback, then record refactor commit before taking next test

Between STOP #1 and STOP #2, the GREEN → COMMIT → REFACTOR phases execute automatically without pausing.

**The reviewer's role:** At each stop, the reviewer validates the work quality and provides either approval ("go") or feedback for improvements. This ensures every step meets quality standards before progression.

## Workflow Decision Tree

```
Start
  ↓
Phase 1: RED (Write Failing Test)
  ↓
STOP #1 → Present to reviewer, wait for approval
  ↓
Phase 2: GREEN (Make Test Pass)
  ↓
Phase 3: COMMIT (Save Progress)
  ↓
Phase 4: REFACTOR (Improve Code)
  ↓
STOP #2 → Present to reviewer, process feedback or get approval
  ↓
Phase 5: REFACTOR_COMMIT
  ↓
Return to Phase 1 for next test
```

**If you encounter problems during any phase**, see `./escalation-protocol.md` for guidance on when and how to ask for help.

## Phase 1: RED (Write Failing Test)

### Objective
Write a test that fails for the right reason, demonstrating what needs to be implemented.

### Actions to Take

1. **Review the specification document** to understand requirements
   - The specification can be a markdown file, issue tracker, or any format agreed with your reviewer
2. **Identify the next uncompleted test** (no ✅) from specification
   - If no uncompleted tests remain, ask what to do next
3. **Mark that test as in_progress** in the TODO list
4. **Write the test matching exactly what the test name promises**
   - If test says "should fail", only verify it throws an error
   - If test says "should increase balance", only verify balance increases
   - Never over-assert beyond what the test name states
5. **Run the test and verify it FAILS for the RIGHT reason**
   - For language-specific test commands, see `./testing-guide.md`
6. **If test passes immediately, BREAK the implementation** to see RED
7. **Confirm the failure message shows exactly what's missing**

### Critical Requirement: Proper RED State

A proper RED state requires:
- ✅ Code compiles successfully
- ✅ Test runs and fails
- ✅ Test fails for the RIGHT reason (not some other error)

**Compilation errors are NOT a proper RED state.** The code must compile before reaching RED.

**Focus on WHAT, not HOW:**
- ❌ Don't think about implementation details during RED
- ❌ Don't create mocks for imaginary dependencies
- ✅ Write simple setup, action, and assertion
- ✅ Think like a user: what should happen?

For detailed guidance on avoiding implementation thinking during RED, see `./escalation-protocol.md`.

**Example of proper RED:**
```
Expectation failed: (updatedAccount.availableBalance → 100) == (initialBalance + amountToAdd → 150)
```
This clearly shows WHAT is missing (balance not increased).

**Example of improper RED:**
```
error: cannot find 'Account' in scope
```
This is a compilation error, not a proper RED state.

### Stop Condition

**STOP #1 HERE.** Present the failing test output to the reviewer and **wait for explicit "go" command** to proceed to GREEN.

**Mandatory waiting rules:**
- **DO NOT proceed** without explicit "go" (or clear equivalent like "proceed", "continue")
- If reviewer gives feedback → implement it, run test again, **STOP again at STOP #1**, wait for "go"
- If unclear whether reviewer approves → **ask explicitly**: "Should I proceed to GREEN?"
- Reviewer feedback ≠ approval to proceed

The reviewer will either:
- Approve with "go" → Proceed to GREEN phase
- Provide feedback → Address concerns, **return to STOP #1**, wait for "go" again

For reviewers: See `./review-guidelines.md` for RED phase review criteria.

### Common Mistakes to Avoid

- ❌ Treating compilation errors as RED state
- ❌ Proceeding to GREEN without stopping
- ❌ Proceeding to GREEN without explicit "go" from reviewer
- ❌ Treating reviewer feedback as approval to proceed
- ❌ Writing test that passes immediately without verifying RED
- ❌ Over-asserting (checking more than test name promises)
- ❌ Creating production code that isn't driven by the test

## Phase 2: GREEN (Make Test Pass)

### Objective
Write minimal code to make the failing test pass.

### Actions to Take

1. **Write the MINIMAL code** to make the test pass
2. **Do NOT write extra code** for future tests
3. **Do NOT refactor yet** - just make it green
4. **Run ALL tests in the test suite** to ensure nothing broke and new test passes
   - For language-specific test commands, see `./testing-guide.md`

### Stop Condition

**NO STOP.** Immediately proceed to COMMIT.

### Common Mistakes to Avoid

- ❌ Stopping here and waiting for approval (don't stop!)
- ❌ Adding code for tests that don't exist yet
- ❌ Refactoring during GREEN phase
- ❌ Not running all tests to check for regressions

## Phase 3: COMMIT (Save Progress)

### Objective
Save the working state with a descriptive commit message.

### Actions to Take

1. **Update the specification document** with ✅ for completed test
2. **Update the TODO list**: mark current task as **completed** (do NOT mark next task yet)
3. **Create a commit** with a descriptive message focusing on WHAT, not HOW
   - Describe the behavior added, not the process
   - Example: "Reject zero amount when adding funds" ✅
   - Do NOT include:
     - TDD process references: "TDD: Red → Green", "using test-driven development" ❌
     - Obvious statements: "all tests passing", "tests included" ❌
     - Implementation details: "add test and implementation for X" ❌
4. **Verify commit was successful**

### Stop Condition

**NO STOP.** Immediately proceed to REFACTOR.

### Common Mistakes to Avoid

- ❌ Not updating the specification
- ❌ Polluting commit message with TDD process notes
- ❌ Marking next task as in_progress (wait until taking next test)

## Phase 4: REFACTOR (Improve Code)

### Objective
Improve code quality while maintaining all passing tests.

### Actions to Take

1. **Review both TEST code and PRODUCTION code**
2. **Look for improvement opportunities:**
   - Duplication
   - Poor naming
   - Complex logic that can be simplified
   - Violations of coding standards
3. **Make refactoring changes if needed:**
   - Make one change at a time
   - Run ALL tests after each change to ensure they stay green
   - Continue until refactoring is complete
4. **State what refactoring was done, or "No refactoring needed"**

### Stop Condition

**STOP #2 HERE** after refactoring is complete. Present the refactored code to the reviewer and **wait for explicit "go" command**.

**Mandatory waiting rules:**
- **DO NOT proceed** to Phase 5 without explicit "go" (or clear equivalent like "proceed", "continue")
- If reviewer gives feedback → implement it, run tests, **STOP again at STOP #2**, wait for "go"
- If reviewer suggests multiple improvements → implement one, **STOP again**, get feedback, repeat
- If unclear whether reviewer approves → **ask explicitly**: "Should I proceed to REFACTOR_COMMIT?"
- Reviewer feedback ≠ approval to proceed

At this stop, two paths are possible:

**Path A - Reviewer gives feedback:**
- Process the requested changes
- Run ALL tests to make sure they stay green
- Return to STOP #2 (see mandatory waiting rules above)

**Path B - Reviewer approves with "go":**
- Run ALL tests to verify everything passes
- Proceed immediately to Phase 5 to record the refactoring commit

For reviewers: See `./review-guidelines.md` for REFACTOR phase review criteria.

### Common Mistakes to Avoid

- ❌ Skipping refactoring review entirely
- ❌ Proceeding to REFACTOR_COMMIT without explicit "go" from reviewer
- ❌ Implementing feedback and immediately proceeding without stopping again
- ❌ Treating reviewer feedback as approval to proceed
- ❌ Not running tests after refactoring changes
- ❌ Deleting passing tests (tests are the specification!)
- ❌ Forgetting to run Phase 5 before returning to RED
- ❌ Proceeding to next test without stopping and waiting for approval

## Phase 5: REFACTOR_COMMIT

### Objective
Create a git commit for refactoring changes, maintaining immutable git history.

### Actions to Take

1. **Determine if code changed during refactoring:**
   - If **code changed** → Create a refactor commit with descriptive message
   - If **no changes** → No git action needed, just note "No refactor changes"

2. **For refactoring changes, create a separate commit:**
   ```bash
   git commit -m "Refactor: <description of what was improved>"
   ```

   Example commit messages:
   - `Refactor: Extract duplicate validation logic into helper function`
   - `Refactor: Rename variables for clarity in account creation`
   - `Refactor: Simplify error handling in reserve operation`

3. **Confirm the commit was created successfully**

4. **Reset focus to the specification** and return to Phase 1 (RED) for the next test

### Important Notes

- **Never use `git commit --amend`** - This workflow maintains immutable history
- **Always create a new commit** for refactoring changes, regardless of scope
- **Every commit represents a verified checkpoint** approved by the reviewer
- **Git history serves as an audit trail** of the complete TDD process

### Common Mistakes to Avoid

- ❌ Using `git commit --amend` to modify previous commits
- ❌ Rewriting git history in any way
- ❌ Forgetting to verify commit was created before moving on
- ❌ Skipping back to RED without recording refactoring changes

## Cardinal Rules

Apply these rules throughout the entire workflow:

1. **NEVER skip RED** - Must see the test fail first
2. **NEVER skip REFACTOR** - Must review code quality
3. **NEVER delete passing tests** - Tests are the specification
4. **NEVER rewrite git history** - No amending, force pushing, or history modification
5. **Two stops only** - STOP #1 at RED, STOP #2 after REFACTOR (not at every phase)
6. **One test at a time** - Complete the full cycle before moving on
7. **Test name precision** - Assert exactly what the test name promises
8. **Minimal implementation** - Only write code driven by failing tests
9. **Reviewer approval required** - Must wait for approval at each verification gate

## Test Naming Convention

Use this convention for naming tests:

**Format:** `test_operation_shouldBehavior_whenCondition`

- **operation**: The domain operation being tested (createAccount, addFunds, reserve, etc.)
- **shouldBehavior**: What the observable outcome should be (fail, succeed, increase, set, etc.)
- **whenCondition**: The specific scenario being tested (whenAmountIsZero, withMatchingCurrency, etc.)

**The assertions in the test MUST match exactly what the test name promises - nothing more, nothing less.**

## Quick Reference

### Interactive Workflow
- **Executing Agent**: Performs TDD implementation work
- **Reviewer**: Validates work at checkpoints (human or AI)
- **Git History**: Immutable audit trail, no history rewriting

### The Two Verification Gates
1. **STOP #1**: At RED - Present failing test to reviewer, wait for approval
2. **STOP #2**: After REFACTOR - Present refactored code to reviewer, process feedback or get approval

### Phase Flow
- **RED**: Write failing test → STOP #1 (wait for reviewer approval)
- **GREEN**: Minimal implementation → No stop
- **COMMIT**: Update docs, commit → No stop
- **REFACTOR**: Improve code → STOP #2 (wait for reviewer approval)
- **REFACTOR_COMMIT**: Create refactor commit (if changes made) → Return to RED

### Refactor Commit Strategy
- **Changes made**: Create new commit → `git commit -m "Refactor: <description>"`
- **No changes**: No git action → Note "No refactor changes"
- **Never use**: `git commit --amend` or any history rewriting
