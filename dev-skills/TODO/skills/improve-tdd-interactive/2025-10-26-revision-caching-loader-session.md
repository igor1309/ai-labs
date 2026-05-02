---
date: 2025-10-26
session: RevisionCachingLoader TDD Implementation
model: claude-sonnet-4-5-20250929
context: Implemented RevisionCachingLoader using TDD Interactive skill with human reviewer
repository: swift-tools
---

# TDD Interactive Skill Improvements

Based on the RevisionCachingLoader implementation session on 2025-10-26.

## Session Summary

Implemented `RevisionCachingLoader` using TDD Interactive skill with human reviewer. Key learnings emerged around test value assessment, setup clarity, and handling tests that pass immediately without driving new implementation.

---

## 1. Add Guidance for "Test Passes Immediately" Scenario

**Current gap:** When a test passes without driving new code (like `test_load_shouldInvokeCache_whenRevisionDiffers`), the skill doesn't provide clear guidance.

**Add to RED phase:**

### When Test Passes Immediately

If your test passes on the first run without any implementation:

1. **STOP and analyze:** The behavior is already implemented
2. **Options:**
   - Keep the test if it documents a distinct behavioral promise (even if implementation is currently the same)
   - Skip/remove if it duplicates existing test coverage
   - Reorder tests - implement a different test that will drive new code first
3. **Ask reviewer:** "Test passes immediately. Should I keep as documentation or skip?"
4. **Do NOT proceed to GREEN** - there's no RED to fix

**Example:** Test A and Test B promise different scenarios but current implementation handles both the same way. Keep both - future refactoring might require different implementations.

**Rationale:** Tests that document distinct behavioral promises have value even when current implementation happens to handle them identically. Future refactoring might require different handling for different scenarios.

---

## 2. Strengthen "Pre-STOP #1 Self-Review" with Specific Checklist

**Current:** Brief mention of removing implementation changes

**Improve to:**

### Pre-STOP #1 Self-Review (MANDATORY)

Before presenting at STOP #1, perform this review:

1. **Check production code changes:**
   ```bash
   git diff Sources/
   ```

2. **Categorize ALL changes as API or IMPLEMENTATION:**
   - **API changes** (acceptable): New types, function signatures, public interfaces
   - **IMPLEMENTATION changes** (remove): Logic, algorithms, computations

3. **Remove ALL implementation changes:**
   - Revert any logic added
   - Keep only API/signature changes needed for test to compile

4. **Verify test matches name promise:**
   - Test name: `test_X_shouldY_whenZ`
   - Assertions: ONLY verify Y, nothing more
   - Over-asserting = implementation thinking, not specification

5. **Re-run test - ensure still RED for RIGHT reason**

**If you skip this review, you risk:**
- Presenting implementation at RED phase
- Over-asserting beyond test name promise
- Polluting the clean RED → GREEN → COMMIT flow

---

## 3. Add "Test Name vs Setup Alignment" Section

**New section for RED phase:**

### Test Name vs Setup Alignment

**Test names** = Behavioral promises (implementation-agnostic)
- `whenNoRevisionCached`, `whenRevisionDiffers`, `whenRevisionMatches`

**Test setup** = Implementation details
- `shouldCacheStub: true/false`, `revisionMatches: true/false`

**Critical:** Setup must clearly express the condition in the test name, even if using implementation details.

**Good practice:**
```swift
// Use argument labels in makeSUT that bridge behavioral promise to implementation
private func makeSUT(
    revisionDiffers shouldCacheStub: Bool = true
)

// Call site is readable:
makeSUT(revisionDiffers: true)  // Clear what condition we're setting up
```

**Bad practice:**
```swift
// Relying on default values to implicitly set up conditions
makeSUT()  // What condition does this represent?

// Complex logic that obscures intent
private func makeSUT(revisionMatches: Bool = false) {
    let shouldCacheStub = !revisionMatches  // Inversion adds cognitive load
    ...
}
```

**Key principle:** Minimal, surgical changes. Add argument label to existing parameter rather than renaming + inverting logic.

---

## 4. Add "Refactoring Principles" Section

**Add to Phase 4 (REFACTOR):**

### Refactoring Principles

1. **Surgical, minimal changes only**
   - Add argument label: ✅ `foo paramName: Type`
   - Rename AND invert logic: ❌ Too much change at once

2. **One test, one assertion focus**
   - Don't add assertions to existing tests
   - Need new assertion? Create new test

3. **Don't refactor unrelated code**
   - Only refactor code touched by current test
   - Found unrelated issue? Note it, fix separately

4. **Refactoring existing tests:**
   - Fixing test setup to match promise: Valid refactoring
   - Must still pass after fix
   - Present at STOP #2 like any other refactoring

5. **Avoid premature abstraction:**
   - 1-2 duplications: Leave it
   - 3+ duplications: Consider extracting
   - Readability > DRY

6. **Avoid adding complexity:**
   - Multiple overloads with semantic parameters: ❌ Too complex
   - Single parameter with clear argument label: ✅ Simple and readable

**Session example:**
```swift
// BAD - Too much complexity
private func makeSUT(noRevisionCached: Bool? = nil,
                     revisionDiffers: Bool? = nil,
                     revisionMatches: Bool? = nil) {
    // Complex logic to map semantic params to implementation...
}

// GOOD - Minimal, surgical
private func makeSUT(
    revisionDiffers shouldCacheStub: Bool = true  // Just added label
)
```

---

## 5. Add "Test Value Assessment" Section

**Add to Cardinal Rules or new section:**

### Assessing Test Value

**A test has value if it:**
1. **Drives new implementation** - Makes you write new code to pass
2. **Documents a distinct behavioral promise** - Specifies a unique scenario, even if implementation is currently the same
3. **Specifies a unique combination** - Different conditions and outcomes than existing tests

**A test has NO value if it:**
1. **Just repeats stateless behavior** - Calls same method multiple times with no state between calls
2. **Exercises already-tested behavior** - Same setup, same assertions as existing test
3. **Only proves repetition** - "2 + 2 = 4, and also 2 + 2 = 4 again"

**When in doubt:** Ask "If I delete this test, what behavior becomes unspecified?"

**Example from session:**
- `test_load_shouldInvokeCache_onDependencySignaledRevisionChange` - Calls stateless loader twice
- The loader has no state between calls, each invocation is independent
- Already tested: shouldCache is called, cache invoked when shouldCache returns true
- This test adds NO new specification - just exercises same behavior twice
- **Verdict:** Keep if serves as scenario documentation, but recognize it's not driving new behavior

**Exception:** Keep tests that document distinct scenarios even if implementation is identical - future refactoring may require different handling.

**Real example that HAS value:**
- `test_load_shouldInvokeCache_whenNoRevisionCached` - Scenario: initial state
- `test_load_shouldInvokeCache_whenRevisionDiffers` - Scenario: revision changed
- Both currently have same implementation, but document different use cases
- Future implementation might need different setup/handling for these scenarios

---

## 6. Clarify STOP Rules for "Test Passes Immediately"

**Update Phase 1 Stop Condition:**

### Stop Condition

**STOP #1 HERE** - Present failing test to reviewer.

**EXCEPTION:** If test passes immediately:
- Do NOT proceed automatically to GREEN
- Present to reviewer: "Test passes immediately, no new code driven"
- Wait for guidance on whether to keep/skip/reorder
- This is NOT a normal STOP #1 - it's a decision point about test value

**Possible outcomes:**
1. Reviewer: "Skip this test" → Remove it, move to next
2. Reviewer: "Keep as documentation" → Note it passes, move to next test that drives implementation
3. Reviewer: "Do test X first instead" → Implement different test that will drive code

---

## 7. Add Troubleshooting Section

**New section:**

## Common Situations and How to Handle Them

### Test passes without new implementation
**What to do:**
- Present to reviewer immediately
- Don't proceed to GREEN phase
- Ask whether to keep as behavioral documentation or skip
- If keeping, note it documents distinct scenario even if implementation is same

### Test name doesn't match setup
**What to do:**
- Note during implementation, don't stop RED phase for it
- Fix during REFACTOR phase (Phase 4)
- Present fix at STOP #2 like any other refactoring
- Example: Adding explicit parameter values to match test promise

### Need to assert multiple things
**What to do:**
- Create separate tests, one assertion focus per test
- Don't pollute existing test with additional assertions
- Each test should verify exactly what its name promises, nothing more

### Found bug in existing test
**What to do:**
- Note it but don't fix during current TDD cycle
- Complete current cycle (through REFACTOR_COMMIT)
- Then start new cycle to fix the bug
- Or fix after all current tests complete

### Refactoring feels complex (multiple steps, inversions, etc.)
**What to do:**
- You're doing too much - make minimal surgical change only
- Example: Just add argument label, don't rename AND invert
- Complexity is a smell that you're over-engineering
- Ask reviewer if simpler approach exists

### Unclear if test adds value
**What to do:**
- Ask: "What becomes unspecified if I delete this?"
- If answer is "nothing" - test has no value
- If answer is "this distinct scenario" - test has documentary value
- Present to reviewer for decision

### Test setup uses implementation details but test name is behavioral
**What to do:**
- Use argument labels to bridge the gap
- `makeSUT(revisionDiffers: true)` bridges behavioral "revisionDiffers" to implementation detail
- Avoid complex mapping logic in makeSUT
- Readability at call site > DRY in helper

---

## Implementation Notes from Session

### What Worked Well

1. **Incremental test addition** - Adding collaborator tests before integration tests
   - `test_load_shouldNotAskShouldCache_onUnderlyingLoaderFailure` (negative case)
   - `test_load_shouldAskShouldCacheWithRequestAndRevision_onSuccessfulLoad` (payload verification)
   - Then conditional behavior tests

2. **Stopping for design discussions** - Before implementation, discussing approach
   - "Should loader track state or ask shouldCache?" - Led to better design
   - "How to make setup match test names?" - Led to argument label solution

3. **Minimal surgical changes** - Adding argument label vs complex refactoring
   - From: `shouldCacheStub: Bool`
   - To: `revisionDiffers shouldCacheStub: Bool`
   - Just one change, clear intent

### What Could Improve

1. **Clearer guidance when test passes immediately** - Spent time analyzing value
2. **Stronger emphasis on "one assertion per test"** - Almost added multiple assertions
3. **Test value assessment criteria** - Would have helped evaluate redundant test earlier

### Key Learnings

1. **Test names are behavioral, setup is implementation** - Bridge with argument labels
2. **Stateless components don't benefit from multi-invocation tests** - No state to corrupt
3. **Tests can document scenarios even when implementation is identical** - Future-proofing
4. **Surgical changes > comprehensive refactoring** - Minimize cognitive load
5. **Over-asserting is implementation thinking** - Test name defines assertion scope

---

## Recommended Changes to TDD Interactive Skill

### High Priority
1. Add "Test Passes Immediately" guidance to RED phase
2. Expand Pre-STOP #1 Self-Review with concrete checklist
3. Add "Test Value Assessment" section to help evaluate test worth

### Medium Priority
4. Add "Test Name vs Setup Alignment" section
5. Add "Refactoring Principles" section
6. Add troubleshooting section

### Low Priority
7. Update STOP rules to clarify "test passes immediately" exception

---

## Example Application

See commit history in `swift-tools` repository, branch `RevisionCachingLoader`:
- Clean RED → GREEN → COMMIT cycles
- Proper Pre-STOP #1 self-review (no implementation at RED)
- Minimal surgical refactoring (argument labels)
- Test value discussion and decision-making
- Complete test coverage verification

Total tests: 11 tests for RevisionCachingLoader
All tests pass, complete behavioral coverage verified.
