---
name: testing-schedulers
version: "1.0.0"
description: Testing time-dependent behavior with RxSwift schedulers. Use when testing delays, debouncing, background operations, or any time-based behavior that requires advancing virtual time.
allowed-tools: Read, Edit, Write, Bash(xcodebuild:*), Bash(swift:*)
---

# Testing with Schedulers

**Announce:** "I'm using the testing-schedulers skill for time-dependent tests."

## Quick Reference

When testing time-dependent behavior (delays, debouncing, etc.), use test schedulers to control virtual time:

```swift
// 1. Create test schedulers - set .immediate for schedulers you don't care about
let (schedulers, testSchedulers) = Schedulers.test(
    main: .immediate,
    interactive: .immediate,
    userInitiated: .immediate
    // Skip 'background' parameter to make it controllable
)

// 2. Pass to SUT
let (sut, ...) = makeSUT(schedulers: schedulers)

// 3. Perform action that triggers delayed behavior
sut.doSomething()

// 4. Assert state BEFORE delay
XCTAssertEqual(state, .pending)

// 5. Advance the scheduler you're testing
testSchedulers.background.advance(by: .seconds(2))

// 6. Assert state AFTER delay
XCTAssertEqual(state, .completed)
```

## The 4 Schedulers

- **main**: Main thread operations
- **interactive**: High-priority user interactions
- **userInitiated**: User-initiated operations
- **background**: Background/delayed operations

## Key Rules

1. **Set `.immediate` for schedulers you don't care about** - this makes tests fast and deterministic
2. **Skip/omit the parameter** for the scheduler you want to control - it becomes a test scheduler
3. **Explicitly list all schedulers** except the one you're testing - don't rely on defaults:
   ```swift
   // Testing background scheduler - explicitly set others to .immediate
   Schedulers.test(
       main: .immediate,
       interactive: .immediate,
       userInitiated: .immediate
       // background omitted → controllable
   )
   ```
4. **Advance time manually** using `testSchedulers.{scheduler}.advance(by:)`:
   ```swift
   testSchedulers.background.advance(by: .seconds(2))
   testSchedulers.main.advance(by: .milliseconds(300))
   ```
5. **Assert before AND after** time advancement to prove timing behavior

## Example: Testing Debounce

```swift
func test_shouldDebounceSearch_for300ms() {
    let (schedulers, testSchedulers) = Schedulers.test(
        interactive: .immediate,
        userInitiated: .immediate,
        background: .immediate
        // main omitted → controllable for debounce
    )
    let (sut, searchSpy) = makeSUT(schedulers: schedulers)

    // Rapid typing
    sut.search("a")
    sut.search("ab")
    sut.search("abc")

    XCTAssertEqual(searchSpy.callCount, 0, "Should not search during debounce")

    testSchedulers.main.advance(by: .milliseconds(300))

    XCTAssertEqual(searchSpy.callCount, 1, "Should search once after debounce")
    XCTAssertEqual(searchSpy.lastQuery, "abc", "Should use final value")
}
```

## Common Mistakes

### Advancing the wrong scheduler
```swift
// WRONG: Advancing background when SUT uses main
let (schedulers, testSchedulers) = Schedulers.test(
    main: .immediate,  // Main is immediate, not controllable!
    background: .immediate
)
testSchedulers.background.advance(by: .seconds(2))  // Has no effect
```

### Advancing before the action
```swift
// WRONG: Advancing time before triggering the delayed operation
testSchedulers.background.advance(by: .seconds(2))
sut.event(.show)  // Delay starts AFTER this, so advance had no effect
```
