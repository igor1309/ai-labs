---
date: 2026-08-21
model: claude-opus-5
description: "Swift XCTest rules — naming, helpers, sentinels, one assertion, linting"
paths:
  - "**/*Tests/**/*.swift"
  - "**/*Tests.swift"
---

# Swift Testing

Test naming pattern is `test_<method>_should<Assertion>_on<Condition>`, <method> could be omitted if tests are focused

The factory should be a private function inside the test class in the Helpers section.

You cannot use `try!`, `guard let` or `if let` in tests - use XCTUnwrap if needed.

You cannot make non-equatable type Equatable for easy tests - use an equatable projection in tests; look for existing projection helpers in the codebase before writing a new one.

Never use `sentinel` as a naming prefix (e.g., `sentinelPhone`).

A sentinel is the property you assert on. Intermediate values used only to construct a sentinel should be inlined, not named:
```swift
// wrong — unnecessary intermediate variables
let a = anyInt()
let b = anyMessage()
let input = makeInput(a, b)

// right — inline into factory call
let input = makeInput(anyInt(), anyMessage())
```

If inlining `anyMessage()`/`anyInt()` into a factory call hurts readability, that is a signal to extract a `private` test helper factory — not to introduce named intermediates. The same applies to SUT and spies: dependencies needed to construct them belong inside `makeSUT` with parameters, not as separate variables in the test body.

One test, one assertion. Multiple `XCTAssert*` calls are OK only when destructuring a single result. The test name must match its single behavioral assertion.

Assert collections via `map` projections, not by indexing individual elements.

TDD: only add a failing `XCTFail()` when adding/changing tests or behavior. Do not add `XCTFail()` if the user only asked to run tests.

Every NEW test file starts with a single `XCTFail()` test and a run that must show exactly 1 failure before any real test is written — a `-only-testing` run against a class that never executes reports 0 tests and exits green (unregistered project file, wrong target name, test-plan exclusion, class-name typo all look identical). A green first run with no prior RED is unproven, not passing.

Add helper extracting particular case from enum if needed.

Do not add "MARK: _ Tests" inside test suites.

## LINTING

`_, _` should be linted to `_,_`
`(sut,_,_)` should be linted as `(sut, _,_)`
`(_,b, c)` should be linted as `(_, b, c)`
`(a,_, c)` should be linted as `(a, _, c)`
