# Jason Gorman Research Integration Plan

## The Actual Problem

**Where:** Phase 1 (RED), Pre-STOP #1 Self-Review (SKILL.md:87-92)

**What's failing:** Agents create collaborators, dependencies, and types that the test doesn't observe, then justify them as "API changes."

### Example: The Collaborator Cascade

Test name: `test_reserve_shouldDecreaseBalance_whenSuccessful`

**Test code:**
```swift
let account = Account(balance: 100)
try account.reserve(50)
XCTAssertEqual(account.balance, 50)  // Only observes balance change
```

**What agent creates:**
```swift
// Production code - RED phase

protocol Repository {
    func save(_ record: ReservationRecord) throws
}

struct ReservationRecord {
    let accountId: UUID
    let amount: Money
    let timestamp: Date
    let status: ReservationStatus
}

enum ReservationStatus {
    case pending, completed, failed
}

struct Account {
    let balance: Int
    private let repository: Repository  // Injected dependency

    init(balance: Int, repository: Repository) {
        self.balance = balance
        self.repository = repository
    }

    func reserve(_ amount: Int) throws {
        // Maybe even implementation logic
    }
}

// Test code - RED phase

class RepositorySpy: Repository {
    var savedRecords: [ReservationRecord] = []

    func save(_ record: ReservationRecord) throws {
        savedRecords.append(record)
    }
}
```

**Agent's justification at Pre-STOP #1:**
- "These are just API changes"
- "The test needs repository to verify behavior"
- "I'm just setting up the structure"
- "No implementation logic, just declarations"

**What test actually observes:**
- Balance decreased from 100 to 50
- Nothing about Repository
- Nothing about ReservationRecord
- Nothing about persistence

**Root cause:** Agent is thinking "HOW will reserve work internally?" instead of "WHAT does THIS test observe?"

---

## The Core Gorman Insight

**Practice #3: The Golden Rule**
> "Don't write source code until a test requires it."

**Our application:**
> "Don't write source code until THIS test OBSERVES it."

**The question that fixes this:**

For each production code change, ask:
1. **"Does THIS test OBSERVE this code?"**
   - Does the test assert on it?
   - Does the test verify its behavior?
   - Does the test check its state?

2. If NO → **Delete it immediately**
   - You invented it thinking about implementation
   - Future tests will add it when needed

3. If YES → **Keep it, but check each member**
   - Does the interface match ONLY what test asserts?
   - Are you adding extra methods/properties the test doesn't use?

---

## The Fix: Update Pre-STOP #1 Self-Review

### Current Self-Review (SKILL.md:87-92)

```
7. Perform Pre-STOP #1 Self-Review
   - Switch to RED Phase Critic role
   - Review production code changes (git diff)
   - Categorize as API vs IMPLEMENTATION
   - Remove any IMPLEMENTATION changes
```

**Problem:** "API vs IMPLEMENTATION" is too vague. Agents classify collaborators as "API."

### Enhanced Self-Review (for red-phase-guide.md)

```markdown
## Pre-STOP #1 Self-Review: RED Phase Critic

Before presenting at STOP #1, switch roles and perform self-review.

### Role Switch: Implementer → Critic

**Announce the switch:**
- "Switching to RED Phase Critic role for self-review"
- Review with fresh perspective
- "Self-review complete" or "Found issues, fixing..."

### The Core Question

**Quick examples to understand "observe":**

```swift
// Test code:
let account = Account(balance: 100)
try account.reserve(50)
XCTAssertEqual(account.balance, 50)
```

**What test observes:**
- `Account` type → YES (test creates it)
- `balance` property → YES (test asserts on it)
- `reserve()` method → YES (test calls it)
- `Repository` protocol → NO (test doesn't mention it)
- `RepositorySpy` → NO (test doesn't verify spy)

---

Run `git diff` and review each production code change.

For EACH class, protocol, type, property, method, or parameter:

**"Does THIS test OBSERVE this code?"**

Observe means **test's assertions directly check it**:
- ✓ Test asserts on it: `XCTAssertEqual(account.balance, 50)`
- ✓ Test verifies it was called: `XCTAssertTrue(spy.wasCalled)`
- ✓ Test creates it in setup: `Account(balance: 100)`

Does NOT mean:
- ❌ Test calls method that MIGHT use this internally
- ❌ "reserve needs Repository to work" (that's implementation, not observation)
- ❌ "The system will need this eventually"
- ❌ "This makes the architecture better"
- ❌ "Future tests might use this"

**Remember:** "Test calls reserve" ≠ "Test observes Repository that reserve uses"

### Decision Tree

```
Does THIS test observe this code?
│
├─ NO → Delete it immediately
│   └─ Future tests will add it when needed
│
└─ YES → Keep it, but check each member

    For each property/method/parameter in this type:
    │
    ├─ Does test reference it? → Keep
    ├─ Does test assert on it? → Keep
    ├─ Does test call it? → Keep
    └─ Otherwise → Delete

    Example:
    struct Account {
        var balance: Int        // Test asserts on it → Keep
        var currency: String    // Test doesn't reference → Delete
        func reserve(...) { }   // Test calls it → Keep
    }
```

### Common Collaborator Cascade Pattern

**Pattern: Invented Dependencies**

Test observes: Balance decreased
```swift
XCTAssertEqual(account.balance, 50)
```

Agent adds:
```swift
protocol Repository { ... }  // ❌ Test doesn't observe Repository
class RepositorySpy { ... }  // ❌ Test doesn't verify spy calls
init(repository: Repository) // ❌ Test doesn't inject repository
```

**Question:** Does test observe Repository?
- Test doesn't assert on repository calls
- Test doesn't verify saved records
- Test doesn't check repository state

**Answer:** NO → Delete all Repository code

**Correct RED:**
```swift
struct Account {
    var balance: Int

    func reserve(_ amount: Int) throws {
        // Empty stub
    }
}
```

**Common agent counter-argument:**
> "But test calls reserve(50), and reserve needs Repository to persist the reservation!"

**Response:**
Does test ASSERT on Repository? Does test CHECK if anything was persisted?
```swift
XCTAssertEqual(account.balance, 50)  // Only checks balance
// No assertion: XCTAssertEqual(spy.savedRecords.count, 1)
// No assertion: XCTAssertTrue(repository.wasCalled)
```

Test doesn't observe Repository → Delete it. What method internally needs is GREEN phase concern, not RED.

---

### The Minimal Stub Rule

After deleting invented collaborators, what's left?

**Only code the test directly references in assertions or setup:**
- Test creates `Account(balance: 100)` → Need `balance` property and init
- Test calls `account.reserve(50)` → Need `reserve()` method
- Test asserts `account.balance` → Already have it

**Stubs return empty/default:**
- Methods that return values: `return 0`, `return []`, `return ""`
- Methods that throw: Empty body (don't throw yet)
- Methods that return objects: Defer until test requires it

---

### Before Deletion: Compilation Safety

Before deleting any code, verify test doesn't directly reference it:

**For each type/protocol/class you plan to delete:**
1. `grep "TypeName" TestFile.swift`
2. If found in test → Keep it (but check its members)
3. If NOT found in test → Safe to delete

**Example:**
```bash
grep "Repository" AccountTests.swift  # No results → Safe to delete
grep "Account" AccountTests.swift     # Found → Keep (check members)
```

This prevents deletion trial-and-error loops.

---

### Safety Check: Did I Delete Too Much?

After deletions, test must still compile.

If compilation fails:
- You deleted something test directly references
- Restore ONLY what test directly uses
- Don't restore extras

Run the test - verify it still fails with assertion error (not compile error).

---

### Self-Review Integrity Check

Before completing review, ask yourself:

**Did I find anything to delete?**

If NO, run these concrete checks:

**Step 1:** Search production code for collaborator patterns:
```bash
grep -E "protocol|class.*Spy|Repository|Manager|Service|Validator" ProductionFile.swift
```

**Step 2:** For each match, search test file:
```bash
grep "MatchedName" TestFile.swift
```

**Step 3:** If test doesn't contain that name → Delete it from production code

**Step 4:** If still nothing to delete after this check → OK to proceed

**This check prevents rubber-stamping.**

Expect to find issues during self-review. If you find nothing, look harder before approving yourself.

---

### Completing Self-Review

Briefly announce what you found:
- What test observes
- What production code you kept
- What you deleted (if anything)

Example (adapt to your situation):

```
Self-review complete.

Test observes: account.balance decreased after reserve()
Kept: Account struct, balance property, reserve() method
Deleted: Repository protocol, RepositorySpy (test didn't assert on them)

Ready for STOP #1.
```

Keep it concise. The content matters, not the format.

---

### If Self-Review Finds Over-Implementation

1. Delete the code test doesn't observe
2. Run test - verify it still fails (assertion error, not compile error)
3. STOP at STOP #1 again
4. Wait for reviewer approval

Do NOT assume it's fixed. Present again at STOP #1.
```

---

## Implementation Plan

### Task 1: Update red-phase-guide.md

**Location:** Replace existing Pre-STOP #1 Self-Review section

**Content:** The enhanced self-review above (starting from "## Pre-STOP #1 Self-Review")

**Estimated tokens:** ~530 tokens (compared to current ~200)

**Trade-off:** Worth it - this is the critical decision point where over-implementation happens

**Key improvements:**
- Examples-first approach (agents learn by example)
- Concrete per-member checklist (not abstract "verify minimal")
- Safety check for over-deletion
- Integrity check to prevent rubber-stamping
- Flexible output format (content over format)

### Task 2: Update escalation-protocol.md

**Location:** Add new escalation trigger

**Content:**
```markdown
## Escalation Trigger: "Test Needs This Dependency"

### Symptom

You're thinking:
- "Test can't work without a Repository"
- "I need to inject this collaborator for testing"
- "The spy is necessary to verify behavior"

But test doesn't have any assertions about the collaborator.

**Example:**
```swift
XCTAssertEqual(account.balance, 50)  // No assertion about Repository
```

Yet you're adding:
```swift
protocol Repository { }  // Test doesn't verify this
```

### Why This Is a Problem

You're thinking about HOW the implementation will work (dependencies, architecture)
instead of WHAT this test observes (assertions, observable behavior).

### Immediate Action

**Ask:** "Does THIS test assert on Repository behavior?"

- Test asserts on it? → Keep
- Test verifies calls to it? → Keep
- Test checks its state? → Keep
- Otherwise → Delete it

**If NO to all → Delete it. Don't escalate. Just delete.**

### When to Escalate

If you genuinely can't tell whether test observes the code:
- Escalate BEFORE STOP #1
- Ask reviewer: "Does this test require X, or am I inventing it?"

### When NOT to Escalate

- Test clearly doesn't assert on collaborator → Just delete it
- You think "but implementation needs it!" → That's GREEN phase, delete it
- You feel uncertain → When in doubt, delete it. Reviewer will tell you if needed.

### Edge Case: Test Injects Collaborator But Doesn't Assert On It

**Scenario:**
```swift
let spy = RepositorySpy()
let account = Account(balance: 100, repository: spy)
try account.reserve(50)
XCTAssertEqual(account.balance, 50)  // Doesn't check spy
```

**Question:** Is Repository observed?
- Test creates spy but doesn't verify it
- Test passes spy to Account but doesn't assert on spy behavior

**Answer:** Keep the collaborator (test explicitly constructs and injects it), but note this is a test smell. The test setup suggests intent to verify Repository but assertion is missing. Don't delete, but mention in self-review output: "Note: Test injects Repository but doesn't assert on it - possible missing assertion."
```

---

## Success Metrics

### At STOP #1 (Primary Goal)

**Improvement indicators:**
- [ ] git diff shows NO protocols/types test doesn't observe
- [ ] Agent self-review output lists what was deleted
- [ ] No collaborators added unless test asserts on them
- [ ] Self-review explicitly shows checking "Does THIS test OBSERVE this?"

**Reduction in reviewer feedback:**
- [ ] Fewer "test doesn't use this" comments
- [ ] Fewer "you invented this dependency" rejections
- [ ] Agents catch collaborator cascade before presenting

### Warning Signs (Improvements Not Working)

**If agents delete too much:**
- Test won't compile after deletions
- Agent restores everything, back to square one
- **Fix:** Emphasize safety check - "test must compile"

**If agents become paralyzed:**
- Spend excessive time asking "does test observe X?" for every line
- Can't make decisions
- **Fix:** Simplify to "Does test assert on it?" - most basic version

**If agents mechanically comply:**
- Produce format perfectly but don't delete anything
- Self-review becomes rubber stamp
- **Fix:** Integrity check should catch this - "Did you find anything to delete?"

---

## Open Questions

1. **Should we add TypeScript/Python examples?**
   - Current: Swift examples only
   - Decision: Add if agents work in those languages, otherwise skip for now

2. **Version bump?**
   - Significant change to Pre-STOP #1
   - Suggestion: v2.4.0

---

## Next Steps

1. **Implement Task 1** - Update red-phase-guide.md Pre-STOP #1 section
2. **Test with real spec** - Use spec with tests that check simple state changes
3. **Observe behavior** - Does agent delete invented collaborators?
4. **Watch for failure modes:**
   - Deletes too much (test won't compile)
   - Analysis paralysis (can't decide)
   - Mechanical compliance (produces format, doesn't think)
5. **Adjust based on observations**
6. **Implement Task 2** if needed
7. **Update to v2.4.0**
8. **Document results** in log

---

## References

### Source Research
- `docs/research/Jason Gorman/Jason Gorman's Actionable Guides_ Writing Proper F.md`
- `docs/research/Jason Gorman/Proper RED in TDD by JG.md`

**Key insight used:** Practice #3 "The Golden Rule" - Don't write source code until a test requires it

**Our adaptation:** Don't write source code until THIS test OBSERVES it

### Current Skill Files
- `public/tdd-interactive/SKILL.md` - v2.3.0
- `public/tdd-interactive/red-phase-guide.md` - Target for Task 1
- `public/tdd-interactive/escalation-protocol.md` - Target for Task 2

### Critical Lines
- SKILL.md:87-92 - Current Pre-STOP #1 self-review (too vague)
- SKILL.md:259 - Cardinal Rule: "Nothing can exist unless a test is directly or indirectly using it"
