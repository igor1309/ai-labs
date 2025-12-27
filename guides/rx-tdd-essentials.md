---
date: 2025-09-08
model: gpt-5.1
description: "Rx TDD essentials for reducer/effect handler development and migration to production."
---

# Rx TDD

## Development Approach

Developing Rx components `*Reducer` and `*EffectHandler` classes directly inside the test file rather than in production code.
This includes:

- Complete implementations - Both the reducer logic and effect handler are fully functional
- Comprehensive test coverage - Extensive tests for all scenarios and edge cases
- Isolated development - Everything contained in one file during development

## Benefits of This Approach

1. Rapid iteration - No need to switch between multiple files
2. Immediate feedback - Tests run against the actual implementation instantly
3. Complete visibility - All logic, tests, and edge cases visible at once
4. Safe experimentation - Changes don't affect production until ready
5. Thorough validation - Forces you to think through all scenarios before production

## The Migration Pattern

Once satisfied with the implementation and all tests pass, move the production classes to their proper location in the production codebase and keep only the test classes in this file.

## Test Structure Pattern

### Exhaustive Combinatorial Testing

```swift
for size in [Appearance.Size.large, .normal, .small] {
    for cardWiggle in [true, false] {
        // Test all combinations
    }
}
```

Test all possible combinations of state variables to ensure no edge cases are missed.

### Reducer Dual Assertion Pattern

For each behavior, write two complementary tests for **Reducer**:

- State change test - What should happen to the state
- Effect delivery test - What effect (if any) should be produced

Example:

- `test_<event>_shouldChangeState_*`
- `test_<event>_shouldDeliverEffect_*`

## Effect Handler Testing Pattern

### Collaboration Testing

```swift
func test_init_shouldNotCallCollaborators() {
    let (sut, wiggle) = makeSUT()
    XCTAssertEqual(wiggle.callCount, 0)
}
```

Tests that dependencies aren't called prematurely.

### Direct Dependency Interaction

```swift
func test_toggleCardWiggle_shouldCallWiggle() {
    let (sut, wiggle) = makeSUT()
    sut.handleEffect(.toggleCardWiggle) { _ in }
    XCTAssertEqual(wiggle.callCount, 1)
}
```

Verifies the effect handler calls the right collaborators.

### Asynchronous Event Dispatch Testing

```swift
func test_toggleCardWiggle_shouldDispatchWiggleCompleteEvent() {
    let (sut, wiggle) = makeSUT()
    expect(sut, with: .toggleCardWiggle, toDeliver: .wiggleComplete) {
        wiggle.complete()
    }
}
```

Tests that completion callbacks dispatch the correct events using expect() helper with XCTestExpectation.

**Key Differences**

- **Reducer**: Tests pure state transformations (input → output)
- **Effect Handler**: Tests side effects and asynchronous collaborations using spy objects and expectations

The Effect Handler pattern focuses on interaction testing rather than state mutation testing.

### Builder Pattern for Test Data

```swift
private func makeState(...) -> State
private func makeCardInfo(...) -> CardInfo
private func makeAppearance(...) -> Appearance
```

Flexible factory methods with **randomized defaults** and **specific overrides** for focused testing.

### Assertion Helpers

```swift
assert(state, event: .animationAtFisrtShowCard) {
    $0.isNeedOnboardingShow = false
    $0.cardInfo.cardWiggle = true
}

assert(state, event: .animationAtFisrtShowCard, delivers: .toggleCardWiggle)
```

Fluent assertion API that clearly expresses expected state mutations and effects.

### Negative Case Coverage

Explicitly test when things should NOT happen:

- `shouldNotChangeState_on*`
- `shouldNotDeliverEffect_on*`

This pattern ensures complete behavioral coverage with readable, maintainable tests.

### Test Naming Convention

- `test_<event>_should<Action>_on<Condition>()`
- `test_<event>_shouldNot<Action>_on<Condition>()`
