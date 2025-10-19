# Escalation Protocol

This guide defines when and how to ask for reviewer help when encountering problems during the TDD Interactive workflow.

## Before Asking for Help

When stuck, use **systematic problem analysis**:

1. **Articulate the problem clearly**
   - What exactly is failing?
   - What did you expect to happen?
   - What actually happened?

2. **Analyze failures systematically**
   - What does the error message tell you?
   - What assumptions might be wrong?
   - What related code or tests can you examine?

3. **Document your attempts**
   - What did you try? (approach + result)
   - Why did it fail? (your hypothesis)
   - What did you learn?

## When to Ask for Help

Ask the reviewer for guidance when:

1. You've made **3 genuine attempts** to solve the problem using different approaches
2. You've **analyzed the failures systematically** and understand why each attempt failed
3. You've **investigated** the error messages and tried relevant fixes
4. You're **stuck in a loop** repeating the same failed approach

## How to Escalate

1. **Summarize what you tried**: List the approaches you attempted
2. **State the current problem**: What specifically is blocking you
3. **Propose options**: Suggest 2-3 possible next steps (if you have ideas)
4. **Wait for reviewer input**: Stop and wait for guidance

## Examples of Valid Escalation

### Scenario: Can't achieve RED state

```
I've attempted to get a proper RED state by:
1. Checking compilation - code compiles successfully
2. Verifying test runs - test passes immediately
3. Temporarily breaking implementation - test still passes

The test appears to be testing existing behavior, not new functionality.

Options:
- Rewrite test to verify different behavior
- Check if specification is unclear
- Skip this test and move to next one

How should I proceed?
```

### Scenario: Can't make test pass

```
I've attempted to implement the feature by:
1. Direct implementation - test fails with error X
2. Alternative approach using Y - test fails with error Z
3. Refactored to use pattern W - still failing

The test expects behavior A, but the implementation produces behavior B.

I need guidance on the correct approach.
```

### Scenario: Tests breaking during refactoring

```
I've refactored the code to extract duplicate logic:
1. Original tests: All passing
2. After extraction: 3 tests now failing with error X
3. Attempted to fix by Y - different tests now failing
4. Reverted changes - back to all passing

The refactoring seems correct but breaks test isolation.

Should I:
- Adjust test setup to work with extracted code
- Choose different refactoring approach
- Skip refactoring for now

What's the best path forward?
```

## What NOT to Do

❌ **Don't ask immediately**: "How do I write this test?"
❌ **Don't ask without trying**: "I don't know how to make this pass"
❌ **Don't loop endlessly**: If attempt #4 is identical to attempt #2, stop and ask

## During Official Stops

At **STOP #1** (RED) and **STOP #2** (REFACTOR), you can ask questions **without needing the escalation protocol**. These are natural checkpoints for discussion and guidance.

---

## Common Problem: Implementation Thinking During RED

### The Mistake

When writing a failing test, agents often think about implementation details:
- "How will this feature work internally?"
- "What classes/dependencies will I need?"
- "Should I add mocks for components that don't exist?"

This leads to complex test setups, over-engineering, and tests that fail for wrong reasons.

### The Correct Approach

During RED phase, focus ONLY on:

1. **Setup**: What initial state is needed?
2. **Action**: What operation to perform?
3. **Assertion**: What should be true after the action?

**Think like a user, not an implementer.**

### Example: Wrong vs Right

**Test name:** `test_addFunds_shouldIncrease_whenValidAmount`

#### ❌ WRONG (implementation thinking)

```python
def test_addFunds_shouldIncrease_whenValidAmount():
    # Overthinking: "I need a validator, a repository, a transaction..."
    validator = Mock(AmountValidator)
    repository = Mock(AccountRepository)
    transaction_manager = Mock(TransactionManager)
    account_service = AccountService(validator, repository, transaction_manager)

    account = Account(balance=100)
    repository.find.return_value = account
    validator.validate.return_value = True

    account_service.addFunds(account_id=1, amount=50)

    # Now stuck: What should I assert? The mock? The account?
    assert account.balance == 150  # Might pass immediately!
```

**Problems:**
- Created infrastructure that doesn't exist yet
- Mocking imaginary dependencies
- Complex setup obscures what's being tested
- Test might pass immediately because it's testing the mock, not real behavior

#### ✅ RIGHT (test thinking)

```python
def test_addFunds_shouldIncrease_whenValidAmount():
    # Setup: Account with initial balance
    account = Account(balance=100)

    # Action: Add valid amount
    account.addFunds(amount=50)

    # Assertion: Balance increased
    assert account.balance == 150
```

**Why this is better:**
- Simple, clear setup
- Tests the behavior directly
- Will properly fail because `addFunds` doesn't exist yet
- Easy to understand what's being tested

### The RED Phase Mindset

**Ask yourself:**
- What's the **simplest setup** that represents the test condition?
- What **single action** am I testing?
- What **one thing** should change after the action?

**Do NOT ask:**
- How will this be implemented?
- What architecture should I use?
- What dependencies will be needed?

**Remember:** The test should fail because the behavior doesn't exist, not because you're mocking imaginary infrastructure.

### When You're Overthinking

If you catch yourself:
- Creating mocks for components that don't exist
- Adding more than 3-5 lines of setup
- Thinking about "how it will work internally"
- Stuck on "what should the architecture be"

**STOP.** Return to basics: Setup → Action → Assertion.

### Simple Test Structure Template

```
# Setup: Create the minimum initial state needed
[object/data in starting condition]

# Action: Perform the operation being tested
[single method call or operation]

# Assertion: Verify the expected outcome
[check that one thing changed as expected]
```

Keep it simple. Keep it focused. Think about WHAT should happen, not HOW it will work.
