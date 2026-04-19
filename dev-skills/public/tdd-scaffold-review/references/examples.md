# Test Name Evaluation Examples

## Ready Test Names

These test names are clear enough to write a failing test without ambiguity:

### `test_withdraw_shouldReturnFalse_onInsufficientFunds`
- **Preconditions**: Account with balance less than withdrawal amount
- **Expected Outcome**: withdraw() returns false, balance unchanged

### `test_addUser_shouldThrowDuplicateException_onExistingEmail`
- **Preconditions**: User with email already exists in system
- **Expected Outcome**: addUser() throws DuplicateException

### `test_calculateTax_shouldApply20Percent_onStandardRate`
- **Preconditions**: Item marked as standard rate
- **Expected Outcome**: Tax calculated as exactly 20% of base price

### `test_sendNotification_shouldQueueEmail_onAsyncMode`
- **Preconditions**: System configured for async mode
- **Expected Outcome**: Email added to queue (not sent immediately)

## Test Names Needing Clarification

These test names are ambiguous and need specific questions answered:

### `test_processPayment_shouldWork`
**Questions needed:**
1. What defines "working"? Return value? State change? External call?
2. What are the preconditions for a valid payment?

### `test_validateInput_shouldHandleErrors`
**Questions needed:**
1. Which specific errors should be handled?
2. How should they be handled? (throw exception, return error code, log?)

### `test_updateCache_shouldBeEfficient`
**Questions needed:**
1. What metric defines "efficient"? (time threshold, memory usage?)
2. What is the acceptable threshold?

### `test_mergeAccounts_shouldUpdateProperly`
**Questions needed:**
1. What specific fields should be updated?
2. What is the expected final state after merge?
3. How are conflicts resolved?

## Borderline Cases

These might be acceptable depending on domain conventions:

### `test_delete_shouldCascade_onParentDeletion`
- Clear IF cascade behavior is well-defined in the domain
- Needs clarification IF multiple cascade strategies exist

### `test_authenticate_shouldSucceed_onValidCredentials`
- Clear IF "valid credentials" has one obvious meaning
- Needs clarification IF multiple auth methods exist

## Key Patterns

**Clear test names typically include:**
- Specific method/action being tested
- Concrete, observable outcome
- Explicit condition or input state

**Unclear test names often use:**
- Vague outcomes ("should work", "properly", "correctly")
- Non-measurable qualities ("efficient", "fast", "good")
- Ambiguous conditions ("valid", "invalid" without context)
- Missing error specifics ("handle errors", "deal with problems")
