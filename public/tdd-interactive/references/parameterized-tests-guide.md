---
title: Parameterized Tests Guide
description: How to handle parameterized tests in TDD Interactive workflow
applies-to: tdd-interactive
version: 1.0.0
---

# Parameterized Tests Guide

Parameterized tests add cognitive complexity on top of achieving proper RED state. This guide shows how to use triangulation (concrete tests first, then parameterize) to maintain TDD discipline.

---

## Core Principle

**Default approach:** Write 2-3 concrete tests to drive the implementation, then extract to parameterized form during REFACTOR.

**Why:** Concrete tests are simpler for achieving proper RED and naturally reveal what needs to be implemented.

---

## Pattern 1: Arrays

When testing operations on arrays, triangulate with concrete cases that drive different logic:

### Step 1: Empty Array (Edge Case)

```swift
// TODO: PARAMETERIZE!
func test_filter_shouldReturnEmpty_whenArrayIsEmpty() {
    let result = filter([], predicate: isEven)

    XCTAssertEqual(result, [])
}
```

**Full TDD cycle:** RED → GREEN → COMMIT → REFACTOR → REFACTOR_COMMIT

### Step 2: Single Element (Basic Logic)

```swift
// TODO: PARAMETERIZE!
func test_filter_shouldReturnEmpty_whenArrayIsEmpty() {
    let result = filter([], predicate: isEven)
    XCTAssertEqual(result, [])
}

// TODO: PARAMETERIZE!
func test_filter_shouldReturnElement_whenArrayHasOneMatch() {
    let result = filter([2], predicate: isEven)

    XCTAssertEqual(result, [2])
}
```

**Full TDD cycle:** RED → GREEN → COMMIT → REFACTOR → REFACTOR_COMMIT

### Step 3: Two Elements (General Algorithm)

```swift
// TODO: PARAMETERIZE!
func test_filter_shouldReturnEmpty_whenArrayIsEmpty() {
    let result = filter([], predicate: isEven)
    XCTAssertEqual(result, [])
}

// TODO: PARAMETERIZE!
func test_filter_shouldReturnElement_whenArrayHasOneMatch() {
    let result = filter([2], predicate: isEven)
    XCTAssertEqual(result, [2])
}

// TODO: PARAMETERIZE!
func test_filter_shouldReturnMatches_whenArrayHasMultiple() {
    let result = filter([1, 2], predicate: isEven)

    XCTAssertEqual(result, [2])
}
```

**Full TDD cycle:** RED → GREEN → COMMIT → REFACTOR → REFACTOR_COMMIT

### Step 4: REFACTOR - Parameterize

During the REFACTOR phase, when you see multiple tests marked `// TODO: PARAMETERIZE!`:

1. Extract to parameterized test with all cases (including additional untested cases)
2. Delete concrete tests (removes all `// TODO: PARAMETERIZE!` markers)
3. Run parameterized test - all cases should pass

```swift
func test_filter_shouldHandleVariousArraySizes() {
    let testCases: [(input: [Int], expected: [Int])] = [
        (input: [], expected: []),
        (input: [2], expected: [2]),
        (input: [1, 2], expected: [2]),
        (input: [1, 2, 3, 4], expected: [2, 4]),
        (input: [1, 3, 5], expected: [])
    ]

    for (input, expected) in testCases {
        let result = filter(input, predicate: isEven)
        XCTAssertEqual(result, expected, "Failed for input: \(input)")
    }
}
```

**Note:** The last two cases `[1, 2, 3, 4]` and `[1, 3, 5]` were NOT driven by concrete tests. They're added during parameterization to increase coverage. The implementation from the first 3 cases should handle them.

---

## Pattern 2: Optionals (Swift)

Optionals have essential duality: nil vs non-nil. Triangulate with both:

### Step 1: nil Case

```swift
// TODO: PARAMETERIZE!
func test_unwrapWithDefault_shouldReturnDefault_whenNil() {
    let result = unwrapWithDefault(nil, default: 42)

    XCTAssertEqual(result, 42)
}
```

**Full TDD cycle:** RED → GREEN → COMMIT → REFACTOR → REFACTOR_COMMIT

### Step 2: non-nil Case

```swift
// TODO: PARAMETERIZE!
func test_unwrapWithDefault_shouldReturnDefault_whenNil() {
    let result = unwrapWithDefault(nil, default: 42)
    XCTAssertEqual(result, 42)
}

// TODO: PARAMETERIZE!
func test_unwrapWithDefault_shouldReturnValue_whenNonNil() {
    let result = unwrapWithDefault(100, default: 42)

    XCTAssertEqual(result, 100)
}
```

**Full TDD cycle:** RED → GREEN → COMMIT → REFACTOR → REFACTOR_COMMIT

### Step 3: REFACTOR - Parameterize

```swift
func test_unwrapWithDefault_shouldHandleOptionals() {
    let testCases: [(input: Int?, expected: Int)] = [
        (input: nil, expected: 42),
        (input: 100, expected: 100),
        (input: 0, expected: 0),
        (input: -50, expected: -50)
    ]

    for (input, expected) in testCases {
        let result = unwrapWithDefault(input, default: 42)
        XCTAssertEqual(result, expected, "Failed for input: \(String(describing: input))")
    }
}
```

---

## When Specification Marks [PARAMETERIZED]

If the executable specification explicitly marks a test as `[PARAMETERIZED]`, this indicates the FINAL FORM. Execute via the triangulation subroutine:

### Example Specification

```
- [ ] test_withdraw_shouldFail_whenInvalidAmount [PARAMETERIZED: 0, -1, -100, 0.001]
```

### Subroutine Steps

1. **Identify 2-3 representative cases** to drive implementation:
   - Simplest edge case (0)
   - Obvious invalid case (-1)
   - Optional: different magnitude (-100) if pattern unclear

2. **Cycle 1**: Write concrete test for FIRST case with `// TODO: PARAMETERIZE!`
   - Full TDD cycle: RED → GREEN → COMMIT → REFACTOR → REFACTOR_COMMIT

3. **Cycle 2**: Write concrete test for SECOND case with `// TODO: PARAMETERIZE!`
   - Full TDD cycle: RED → GREEN → COMMIT → REFACTOR → REFACTOR_COMMIT

4. **Optional Cycle 3**: If implementation pattern unclear, add third case
   - Full TDD cycle: RED → GREEN → COMMIT → REFACTOR → REFACTOR_COMMIT

5. **REFACTOR Phase**: Extract to parameterized form
   - Create parameterized test with ALL cases from specification
   - Delete concrete tests (removes `// TODO: PARAMETERIZE!` markers)
   - Run parameterized test - all cases should pass
   - Commit parameterization

6. **Mark the parameterized test complete** in specification

### Example Execution

**Cycle 1:**
```swift
// TODO: PARAMETERIZE!
func test_withdraw_shouldFail_whenAmountIsZero() {
    let account = Account(balance: 100)

    XCTAssertThrowsError(try account.withdraw(0))
}
```

**Cycle 2:**
```swift
// TODO: PARAMETERIZE!
func test_withdraw_shouldFail_whenAmountIsZero() { ... }

// TODO: PARAMETERIZE!
func test_withdraw_shouldFail_whenAmountIsNegative() {
    let account = Account(balance: 100)

    XCTAssertThrowsError(try account.withdraw(-1))
}
```

**After both cycles, during REFACTOR:**
```swift
func test_withdraw_shouldFail_whenInvalidAmount() {
    let invalidAmounts = [0, -1, -100, 0.001]

    for amount in invalidAmounts {
        let account = Account(balance: 100)
        XCTAssertThrowsError(
            try account.withdraw(amount),
            "Should fail for amount: \(amount)"
        )
    }
}
```

---

## The `// TODO: PARAMETERIZE!` Marker

### Purpose

- **Maintains context** across multiple TDD cycles
- **Signals intention** to extract to parameterized form
- **Searchable** - easy to find related concrete tests
- **Removed automatically** when concrete tests are deleted during parameterization

### When to Add

Add `// TODO: PARAMETERIZE!` when:
1. Specification marks test as `[PARAMETERIZED]`
2. You recognize a pattern emerging (second concrete test reveals similarity)
3. You're triangulating toward a general solution

### When to Remove

Remove by deleting the concrete tests during REFACTOR phase after extracting to parameterized form.

---

## Why Not Parameterize Immediately?

**Problems with parameterized tests during RED:**
- Building test data structures → over-engineering temptation
- Loop/iteration logic → implementation thinking
- Less obvious RED state (which case is actually failing?)
- Pressure to implement general solution instead of minimal code

**Benefits of concrete-first approach:**
- Simple RED state for each case
- Natural discovery of implementation pattern
- Forces proper triangulation
- Parameterization happens in REFACTOR where abstractions belong

---

## Numbers Example (For Comparison)

While arrays and optionals better illustrate triangulation necessity, numbers can also follow this pattern:

**Cycle 1:** Zero case
**Cycle 2:** Negative case
**REFACTOR:** Parameterize over `[0, -1, -100, -999999]`

The key insight: you only need 2 concrete cases to drive "reject non-positive" logic. The parameterized form adds exhaustive coverage.

---

## Summary

1. **Default:** Write 2-3 concrete tests with `// TODO: PARAMETERIZE!` markers
2. **Each concrete test:** Full TDD cycle (RED → GREEN → COMMIT → REFACTOR → REFACTOR_COMMIT)
3. **After triangulation:** Extract to parameterized form during REFACTOR
4. **Delete concrete tests** and `// TODO: PARAMETERIZE!` markers
5. **Verify:** Parameterized test passes for all cases

This approach maintains TDD discipline while achieving comprehensive coverage through parameterization.
