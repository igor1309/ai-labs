---
title: TDD Flow - Mandatory Process
purpose: Defines the strict Test-Driven Development cycle for AI coding agents
audience: AI coding assistants implementing features using TDD
stops: 2 (at RED and after REFACTOR)
cycle: RED → [STOP] → GREEN → COMMIT → REFACTOR → [STOP] → RECORD_REFACTOR_COMMIT
---

# TDD Flow - Mandatory Process

## The Sacred Cycle: RED → [STOP] → GREEN → COMMIT → REFACTOR → [STOP] → RECORD_REFACTOR_COMMIT

**CRITICAL RULE: There are TWO mandatory stops:**
1. **STOP #1 at RED** - Wait for "go" to proceed to GREEN
2. **STOP #2 after REFACTOR** - Process feedback if any, then record the refactor commit decision (amend local changes or create a dedicated refactor commit), then take next test

**Between STOP #1 and STOP #2: GREEN → COMMIT → REFACTOR happens automatically without pausing.**

---

## Phase 1: RED (Write Failing Test)

### Actions:
1. Review specification document
2. Identify next uncompleted test (no ✅) from specification
   - If no uncompleted tests remain, ask what to do next
3. Mark that test as **in_progress** in TODO list
4. Write the test that matches EXACTLY what the test name promises
   - If test says "should fail", only verify it throws an error
   - If test says "should increase balance", only verify balance increases
   - Do NOT over-assert beyond what the test name states
5. Run the test and verify it FAILS for the RIGHT reason
6. If test passes immediately, BREAK the implementation to see RED
7. Confirm the failure message shows exactly what's missing

### CRITICAL REQUIREMENT:
**THE CODE MUST COMPILE!** Compilation errors are NOT a proper RED state.

A proper RED state means:
- ✅ Code compiles successfully
- ✅ Test runs and fails
- ✅ Test fails for the RIGHT reason (not some other error)

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

### Stop Condition:
**STOP #1 HERE. Show the failing test output. Wait for "go" to proceed to GREEN.**

### Common Mistakes to Avoid:
- ❌ Treating compilation errors as RED state
- ❌ Proceeding to GREEN without stopping
- ❌ Writing test that passes immediately without verifying RED
- ❌ Over-asserting (checking more than test name promises)
- ❌ Creating production code that isn't driven by the test

---

## Phase 2: GREEN (Make Test Pass)

### Actions:
1. Write the MINIMAL code to make the test pass
2. Do NOT write extra code for future tests
3. Do NOT refactor yet - just make it green
4. Run ALL tests in the test suite to ensure nothing broke and new test passes

### Stop Condition:
**NO STOP. Immediately proceed to COMMIT.**

### Common Mistakes to Avoid:
- ❌ Stopping here and waiting for approval (don't stop!)
- ❌ Adding code for tests that don't exist yet
- ❌ Refactoring during GREEN phase
- ❌ Not running all tests to check for regressions

---

## Phase 3: COMMIT (Save Progress)

### Actions:
1. Update the specification document with ✅ for completed test
2. Update the TODO list: mark current task as **completed** (do NOT mark next task yet)
3. Create a commit with a descriptive message (WHAT, not HOW)
   - Describe the behavior added, not the process
   - Example: "Reject zero amount when adding funds" ✅
   - NOT: "TDD: Red → Green → Commit" ❌
4. Verify commit was successful

### Stop Condition:
**NO STOP. Immediately proceed to REFACTOR.**

### Common Mistakes to Avoid:
- ❌ Not updating the specification
- ❌ Polluting commit message with TDD process notes
- ❌ Marking next task as in_progress (wait until taking next test)

---

## Phase 4: REFACTOR (Improve Code)

### Actions:
1. Review both TEST code and PRODUCTION code
2. Look for:
   - Duplication
   - Poor naming
   - Complex logic that can be simplified
   - Violations of coding standards
3. Make refactoring changes if needed:
   - Make one change at a time
   - Run ALL tests after each change to ensure they stay green
   - Continue until refactoring is complete
4. State what refactoring was done, or "No refactoring needed"

### Stop Condition:
**STOP #2 HERE after refactoring is complete.**

At this stop, there are two possible paths:

**Path A - User gives feedback:**
- Process the requested changes
- Run ALL tests to make sure they stay green
- STOP again (return to STOP #2)
- Repeat until user gives "go"

**Path B - User says "go":**
- Run ALL tests to verify everything passes
- If refactoring was done (code changed):
  - Keep the scope assessment explicit in your notes (local vs significant)
  - If the refactoring scope is **local** (small cleanup, same files touched during GREEN, or cosmetic improvements), run `git commit --amend --no-edit`
  - If the refactoring scope is **significant** (cross-cutting changes, new abstractions, or touching files beyond the immediate feature), create a separate commit with a descriptive refactor message
- If no refactoring (no changes): skip commit/amend
- Automatically proceed to Phase 1 (RED) for next test

### Common Mistakes to Avoid:
- ❌ Skipping refactoring review entirely
- ❌ Not running tests after refactoring changes
- ❌ Deleting passing tests (tests are the specification!)
- ❌ Creating new refactor commit when changes were purely local
- ❌ Amending when refactoring introduced broader structural changes
- ❌ Amending when no refactoring was done
- ❌ Not waiting for user feedback at STOP #2
- ❌ Proceeding to next test without stopping and waiting for approval

---

## Cardinal Rules

1. **NEVER skip RED** - Must see the test fail first
2. **NEVER skip REFACTOR** - Must review code quality
3. **NEVER delete passing tests** - Tests are the specification
4. **Two stops only** - STOP #1 at RED, STOP #2 after REFACTOR (not at every phase)
5. **One test at a time** - Complete the full cycle before moving on
6. **Test name precision** - Assert exactly what the test name promises
7. **Minimal implementation** - Only write code driven by failing tests

---

## Test Name Convention

`test_operation_shouldBehavior_whenCondition`

- **operation**: The domain operation being tested (createAccount, addFunds, reserve, etc.)
- **shouldBehavior**: What the observable outcome should be (fail, succeed, increase, set, etc.)
- **whenCondition**: The specific scenario being tested (whenAmountIsZero, withMatchingCurrency, etc.)

**The assertions in the test MUST match exactly what the test name promises - nothing more, nothing less.**
