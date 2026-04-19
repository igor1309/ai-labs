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

When an effect handler has **multiple collaborators**, use a single test with a combined call count — never one test per collaborator:

```swift
func test_init_shouldNotCallCollaborators() {
    let (sut, spies) = makeSUT()
    XCTAssertNotNil(sut)
    XCTAssertEqual(spies.callCounts, 0)  // sum of all spy callCounts
}
```

Use `XCTAssertNotNil(sut)` to retain the SUT for the duration of the test — without it, ARC may deallocate the SUT before assertions run, defeating `trackForMemoryLeaks`. When there is a single spy (no `Spies` struct), the same pattern applies:

`Spies.callCounts` is a computed property that sums all spy `callCount` values. This ensures no collaborator is called prematurely, with a single readable assertion.

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

### Spy Typealiases

Define a private typealias for every spy type. This makes the `Spies` struct readable and clarifies each collaborator's contract at a glance:

```swift
private typealias RequestVerificationCodeSpy = Spy<Void, Event.Completion.VerificationCode>
private typealias CreateFeedbackApplicationSpy = Spy<(Digest, String), Event.Completion.CreateFeedbackApplication>
private typealias NotifyIncorrectOTPSpy = CallSpy<(Verification, String), Void>
```

### `Spy` vs `CallSpy`

- `Spy<Payload, Response>` — async collaborator with a captured completion. Tests control when the completion fires via `complete(with:)`. Use when the handler dispatches an event in the completion callback.
- `CallSpy<Payload, Response>` — synchronous collaborator that returns immediately. Use for fire-and-forget effects or collaborators whose return value is consumed inline.

The choice follows from the domain: if there is a matching completion event, the collaborator is async (`Spy`). If the effect has no completion event, the collaborator is fire-and-forget (`CallSpy`).

### Fire-and-Forget Effects

When an effect has no corresponding completion event in the domain, the collaborator is synchronous — use `CallSpy`, not `Spy`. The handler calls the collaborator and returns without dispatching. Test coverage is a single "shouldCall" test verifying the payload:

```swift
func test_notifyIncorrectOTP_shouldCallNotifyIncorrectOTP() {

    let verification = makeVerification()
    let message = anyMessage()
    let (sut, spies) = makeSUT()

    sut.handleEffect(.notifyIncorrectOTP(verification: verification, message: message)) { _ in }

    XCTAssertNoDiff(spies.notifyIncorrectOTP.payloads.map(\.0), [verification])
    XCTAssertNoDiff(spies.notifyIncorrectOTP.payloads.map(\.1), [message])
}
```

### Hide What the Test Doesn't Assert On

If a test asserts on `digest`, the `otp` parameter should come from a randomized default (`anyMessage()`), not a named variable. Factory helpers with randomized defaults achieve this — tests read as "given X, expect Y" with no noise:

```swift
// good — only the asserted value is named
let verification = makeVerification()
sut.handleEffect(.notifyIncorrectOTP(verification: verification, message: anyMessage())) { _ in }

// bad — unnecessary named variable adds noise
let verification = makeVerification()
let message = anyMessage()  // not asserted on, shouldn't be named
sut.handleEffect(.notifyIncorrectOTP(verification: verification, message: message)) { _ in }
```

### Struct Boundaries For Collaborator Interfaces

When a reducer effect or handler closure has more than 2 domain parameters, extract a struct. But keep **two separate structs**: one for the effect payload (owned by the effect enum) and one for the handler's collaborator closure.

The handler's collaborator struct must contain **only what the collaborator needs** — never internal dispatching state (e.g., item `UUID` used only to route the response back):

```swift
// Effect payload — full context including id for routing
extension AttachmentsEffect {
    struct Upload: Equatable {
        let id: UUID          // used by handler to dispatch result back
        let requestID: String
        let url: URL
        let fileName: String
    }
}

// Handler collaborator — only what the upload API needs
extension AttachmentsEffectHandler {
    struct UploadRequest: Equatable {
        let requestID: String
        let url: URL
        let fileName: String
    }
    typealias Upload = (UploadRequest, @escaping (Result<FileID, Error>) -> Void) -> Void
}
```

Add a mapping helper on the effect struct, placed **immediately below its call site** (not in a distant extension):

```swift
private extension AttachmentsEffect.Upload {
    var uploadRequest: AttachmentsEffectHandler.UploadRequest {
        .init(requestID: requestID, url: url, fileName: fileName)
    }
}
```

### Typealias Scoping

Domain typealiases (e.g., `FileID`, `RequestID`) must be scoped to the type that primarily uses them — never at global/module level:

```swift
extension AttachmentsEffectHandler {
    typealias FileID = Int          // scoped here, not global
    typealias Delete = (FileID) -> Void
}
```

Reference them via the owning type alias (`SUT.FileID`) inside test helpers.

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

Both reducer and effect handler tests lead with the **operation name** (event case or effect case), never trailing it as an `_on<X>` condition.

#### Reducer Tests

Reducer tests lead with the **event case name**:

- `test_<eventCase>_should<Action>()`
- `test_<eventCase>_should<Action>_on<Condition>()` — when the same event has multiple outcomes

Examples:
- `test_addItems_shouldNotChangeState_onEmptyItems`
- `test_stagingCompleted_shouldSetUploadingStatus_onValidDraft`
- `test_stagingCompleted_shouldDeliverNoEffect_onInvalidDraft`
- `test_uploadCompleted_shouldSetUploadedStatus_onSuccess`
- `test_delete_shouldDeliverDeleteFileEffect_onUploadedItem`

Not: `test_shouldSetUploadingStatus_onStagingCompletedWithValidDraft` — event trailing as condition is backwards.

#### Effect Handler Tests

Effect handler tests lead with the **effect case name**:

- `test_<effectCase>_should<Action>()`
- `test_<effectCase>_shouldDispatch<EventName>()`
- `test_<effectCase>_should<Action>_on<ResultCondition>()` — when the same effect has multiple outcomes

Examples:
- `test_upload_shouldCallUploadWithRequest`
- `test_upload_shouldDispatchUploadCompletedWithSuccess_onSuccess`
- `test_upload_shouldDispatchUploadCompletedWithFailure_onFailure`

Not: `test_shouldCallUpload_onUploadEffect` — effect trailing as condition is backwards.
