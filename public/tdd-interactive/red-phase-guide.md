# RED Phase - Writing Failing Tests

This guide provides detailed instructions for writing tests that fail for the right reason during the RED phase of TDD.

## Assert-First Workflow

Start by writing ONLY the assertion that verifies what the test name promises. Then work backwards to add action, then setup.

### Example - Test promises "deposit should increase balance when valid amount"

**Step 1** - Write assertion only (what outcome do we want?):
```
@Test
func test_deposit_shouldIncrease_whenValidAmount() {
    assert(account.balance == 150)
}
```

**Step 2** - Work backwards: What action produces this outcome?
- Add: `account.deposit(50)`

**Step 3** - Work backwards: What setup makes the action possible?
- Add: `let account = Account(balance: 100)`

**Final test reads top-to-bottom (setup → action → assertion):**
```
let account = Account(balance: 100)  // Setup
account.deposit(50)                  // Action
assert(account.balance == 150)       // Assertion
```

### Why this order prevents over-implementation

- Assertion keeps you focused on WHAT should happen (balance increases to 150)
- You only add action/setup needed to make assertion work
- You don't think about "how will deposit be implemented internally" yet

### Wrong approach (don't do this)

Starting with setup makes you think about implementation:
```
// ❌ Starting with setup leads to implementation thinking:
let validator = Validator()        // "How will validation work?"
let repository = Repository()      // "Where will data be stored?"
let account = Account(...)         // "What dependencies does Account need?"
// ... now you're thinking about HOW, not WHAT
```

---

## Critical Requirement: Proper RED State

A proper RED state requires:
- ✅ Code compiles successfully
- ✅ Test runs and fails
- ✅ Test fails for the RIGHT reason (not some other error)

**Compilation errors are NOT a proper RED state.** The code must compile before reaching RED.

### Focus on WHAT, not HOW

- ❌ Don't think about implementation details during RED
- ❌ Don't create mocks for imaginary dependencies
- ✅ Write simple setup, action, and assertion
- ✅ Think like a user: what should happen?

For detailed guidance on avoiding implementation thinking during RED, see `./escalation-protocol.md`.

### Example of proper RED

```
Expectation failed: (updatedAccount.availableBalance → 100) == (initialBalance + amountToAdd → 150)
```
This clearly shows WHAT is missing (balance not increased).

### Example of improper RED

```
error: cannot find 'Account' in scope
```
This is a compilation error, not a proper RED state.

**For concrete examples of what's wrong and what's right**, see `./red-phase-examples.md`.

---

## Pre-STOP #1 Self-Review (MANDATORY)

**⚠️ CONTEXT SWITCH: You are now the RED Phase Critic, not the test implementer.**

Your role has changed:
- **Before:** Implementer trying to make the test work
- **Now:** Critic finding violations of RED phase rules
- **Objective:** Find what's wrong, not defend what you built

Approach this review as if someone else wrote the code.

---

### Change Analysis

Review production code changes (use `git diff` to examine modifications).

Example showing multiple changes - **list ALL your changes:**

| File | Line(s) | Change Description | Category | Action |
|------|---------|-------------------|----------|--------|
| Example.swift | 23 | Added property declaration | API | Keep |
| Example.swift | 45 | Added method call | IMPLEMENTATION | ❌ Remove |

**Categories:**
- **API**: Type declarations, method signatures, property declarations, parameters (no behavior)
- **IMPLEMENTATION**: Method calls, logic, calculations, control flow, assignments

**Action required:**
- If NO production files modified → Good, critic review complete
- If any changes marked IMPLEMENTATION → remove them, re-run test, redo this analysis
- Only proceed when all changes are API-only

**✅ CONTEXT SWITCH BACK: You are now the test implementer again.**

If violations were found and fixed, re-run the test to verify proper RED state before proceeding to STOP #1.

---

## Common Mistakes to Avoid

- ❌ Treating compilation errors as RED state
- ❌ Adding implementation logic to production code during RED phase
- ❌ Skipping the mandatory Pre-STOP #1 Self-Review
- ❌ Proceeding to GREEN without stopping
- ❌ Proceeding to GREEN without explicit "go" from reviewer
- ❌ Treating reviewer feedback as approval to proceed
- ❌ Writing test that passes immediately without verifying RED
- ❌ Over-asserting (checking more than test name promises)
