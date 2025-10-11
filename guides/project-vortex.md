# Project `Vortex` (Fora iOS)

Due to the size and complexity of the project it is essential to use `-quiet` with `xcodebuild` to reduce output.
Xcode project file is located in a subfolder `Vortex`.

## LINTING
Type declarations should be separated from body by empty line.

## BUILD
cd Vortex &&                             \
xcodebuild build -quiet                  \
  -scheme Vortex-SELECTED_TESTS          \
  -destination 'platform=iOS Simulator,arch=arm64,id=421676B1-6579-4377-8198-F8747A1328A7' \
  OTHER_SWIFT_FLAGS='-suppress-warnings' \
  | xcpretty -s                          \
&& cd ..

## TEST
cd Vortex &&                             \
xcodebuild test -quiet                   \
  -scheme Vortex-SELECTED_TESTS          \
  -destination 'platform=iOS Simulator,arch=arm64,id=421676B1-6579-4377-8198-F8747A1328A7' \
  OTHER_SWIFT_FLAGS='-suppress-warnings' \
  | xcpretty -s                          \
&& cd ..

# MODULE
cd swift-vortex &&                                                  \
xcodebuild test -quiet                                              \
  -scheme CVVPIN_Services                                           \
  -destination 'platform=macOS,arch=arm64,name=My Mac'              \
  -only-testing:CVVPIN_ServicesTests/OrchestratorTests              \
  -only-testing:CVVPIN_ServicesTests/OrchestratorReducerTests       \
  -only-testing:CVVPIN_ServicesTests/OrchestratorEffectHandlerTests \
  -only-testing:CVVPIN_ServicesTests/ChangePINServiceAdapterTests   \
  | xcpretty -s \
&& cd ..

cd swift-vortex && swift build --target CVVPIN_ServicesTests \
&& cd ..

---

## Testing with Schedulers

### Quick Reference

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

### The 4 Schedulers

- **main**: Main thread operations
- **interactive**: High-priority user interactions
- **userInitiated**: User-initiated operations
- **background**: Background/delayed operations

### Key Rules

1. **Set `.immediate` for schedulers you don't care about** - this makes tests fast and deterministic
2. **Skip/omit the parameter** for the scheduler you want to control - it becomes a test scheduler
3. **Explicitly list all schedulers** except the one you're testing - don't rely on defaults
4. **Advance time manually** using `testSchedulers.{scheduler}.advance(by:)`
5. **Assert before AND after** time advancement to prove timing behavior

### Example: Testing a 2-second background delay

```swift
func test_shouldDismissAfter2Seconds() {
    let (schedulers, testSchedulers) = Schedulers.test(
        main: .immediate,
        interactive: .immediate,
        userInitiated: .immediate
        // background omitted → controllable
    )
    let (sut, stateSpy) = makeSUT(schedulers: schedulers)

    sut.event(.show)

    XCTAssertEqual(stateSpy.values.last, .showing, "Before delay")

    testSchedulers.background.advance(by: .seconds(2))

    XCTAssertEqual(stateSpy.values.last, .dismissed, "After 2s delay")
}
```

## Reference Implementation

See: `RootViewModelFactory+makeOrchestratorTests.swift:640` - `test_pinChangeSuccess_shouldDismissInformerAfter2Seconds()`
