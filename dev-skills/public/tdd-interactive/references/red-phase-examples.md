# RED Phase Examples

This document shows the most common mistake during RED phase and how to avoid it.

## The Core Problem

Agents add implementation logic while writing the test, making the test pass immediately. This defeats TDD - you never see proper RED.

**The rule:** During RED, add only API signatures to make the test compile. Do NOT add implementation logic.

---

## Example: Testing Error Handling

### ❌ WRONG - Over-Implementation

**Test:**
```
test_processPayment_shouldRecordRollback_whenStorageFails() {
    let (service, callLog) = makeSUT(storageWillFail: true)

    service.processPayment(100)

    assert(callLog.contains("rollback"))
}
```

**Production changes during RED (WRONG):**
```
class PaymentService {
    // ❌ WRONG: Added dependencies (implementation architecture)
    let storage: Storage
    let callLog: CallLog

    func processPayment(amount) {
        // ❌ WRONG: Added full implementation
        try {
            storage.save(amount)
            callLog.record("commit")
        } catch {
            callLog.record("rollback")  // ← This IS the behavior being tested!
        }
    }
}
```

**Result:** Test passes immediately ❌

**Why wrong:** You added the complete implementation (`callLog.record("rollback")`) during RED. The test never failed meaningfully.

---

### ✅ RIGHT - Minimal API

**Test:**
```
test_processPayment_shouldRecordRollback_whenStorageFails() {
    let (service, callLog) = makeSUT(storageWillFail: true)

    service.processPayment(100)

    assert(callLog.contains("rollback"))
}
```

**Production changes during RED (RIGHT):**
```
class PaymentService {
    // ✅ API only: method signature
    func processPayment(amount) {
        // Empty - no implementation yet
    }
}
```

**Run test:**
```
Test failed: Expected callLog to contain "rollback", but callLog was empty
```

**This is proper RED!** ✅
- Code compiles
- Test fails with clear message: "rollback" not recorded
- Ready for GREEN phase

---

## API vs IMPLEMENTATION

### ✅ API (Keep during RED)
- Type names: `class PaymentService`, `struct User`
- Type shape: `struct Account { balance: Decimal, id: String }`
- Method signatures: `func process(amount: Int) throws`
- Public interface: What operations are available

### ❌ IMPLEMENTATION (Remove during RED)
- Dependencies: `let repository: Repository`, `let logger: Logger`
- Initialization parameters: `init(repository: Repository)`
- Method calls: `repository.save()`, `logger.log()`
- Logic: `if amount > 0 { ... }`, `for item in items { ... }`
- Assignments: `balance = balance + amount`
- Return statements with values: `return calculated result`

---

## Quick Check

Before STOP #1, ask yourself:

**"If I remove all my production code changes, will the test fail to compile?"**
- **YES** → Good, you added necessary API
- **NO** → Bad, you added unnecessary code

**"Does my test pass?"**
- **YES** → Wrong! You over-implemented. Remove implementation logic.
- **NO** → Good, check if failure is meaningful (not compilation error)

---

## The Litmus Test

**Can you describe in one sentence what implementation would make this test pass?**

If YES → You probably already implemented it. Check your production code changes.

If NO → Good! You're at proper RED, ready to discover the implementation during GREEN.
