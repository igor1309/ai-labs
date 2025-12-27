---
date: 2025-12-02
model: gpt-5
description: "RootViewModelFactory integration test guide covering base classes, spies, and local agent usage."
---

# RootViewModelFactory Integration Tests Guide

Testing composition methods in `RootViewModelFactory` that coordinate remote calls, caching, and response mapping.

## Test Infrastructure Overview

### Base Test Classes Hierarchy

```
RootViewModelFactoryTests (base)
    └── SplashScreenRootViewModelFactoryTests
    └── RootViewModelFactoryServiceCategoryTests
```

- **`RootViewModelFactoryTests`**: Base class providing `makeSUT()` returning `(sut, httpClient, logger)`
- Specialized subclasses add domain-specific helpers

### Key Test Doubles

#### HTTPClientSpy

Location: `VortexTests/Services/HTTP/HTTPClientSpy.swift`

```swift
let httpClient = HTTPClientSpy()

// Capture requests
httpClient.requests           // [URLRequest]
httpClient.callCount          // Int

// Complete requests
httpClient.complete(with: error)                    // Error
httpClient.complete(with: data)                     // Data (200 OK)
httpClient.complete(with: (data, response))         // Full control
httpClient.complete(with: result, for: request)     // Specific request
```

#### HTTPClientSpy Extensions

Location: `VortexTests/TestHelpers/HTTPClientSpy+ext.swift`

```swift
// Assert query parameters
httpClient.assert(queryItems: [[URLQueryItem]])
httpClient.queryItems                               // [[URLQueryItem]]

// Path component helpers
httpClient.lastPathComponentsSorted(for: "serial")  // ["endpoint-value", ...]
httpClient.lastPathComponentsWithQueryValue(for: "serial")  // [String?]
```

Location: `RootViewModelFactoryServiceCategoryTests.swift`

```swift
// Assert endpoint calls
httpClient.expectRequests(withLastPathComponents: ["getFastPaymentsButtonList"])
httpClient.expectRequests(withQueryValueFor: "serial", match: ["endpoint-serialValue"])
```

#### LocalAgentMock

Location: `VortexTests/CompositionRoot/Services/LocalAgentMock.swift`

```swift
// Initialize with cached data
let localAgent = LocalAgentMock(stubs: [
    (cachedItems, "cached-serial")
])

// Verify interactions
localAgent.loadCallCount
localAgent.storeCallCount
localAgent.requestedTypes
localAgent.storedValues                     // [(Encodable, String?)]
localAgent.getStoredValues(ofType: T.self)  // [T]
localAgent.getStoredSerials(forType: T.self) // [String?]
```

#### Model Mock

Location: `VortexTests/Model/Model+mockWithEmptyExcept.swift`

```swift
let model: Model = .mockWithEmptyExcept(
    localAgent: localAgentMock
)
```

### Async Handling

```swift
// Wait for actor thread hop (async operations to complete)
self.awaitActorThreadHop()
```

## Test Patterns

### Pattern 1: Testing HTTP Request Parameters

From `RootViewModelFactory+getAndCacheSplashScreenTimePeriodsTest.swift`:

```swift
func test_scheduleGetAndCacheSplashScreenTimePeriods_shouldCallHTTPClient() {

    let (sut, httpClient, _) = makeSUT()

    sut.scheduleGetAndCacheSplashScreenTimePeriods()

    self.awaitActorThreadHop()
    httpClient.complete(with: anyError())

    httpClient.expectRequests(withLastPathComponents: [
        "getSplashScreenTimePeriods"
    ])
}
```

### Pattern 2: Testing Completion Values

```swift
func test_getAndCacheSplashScreenTimePeriods_shouldCompleteWithFalse_onMissingCacheAndRemoteFailure() {

    let (sut, httpClient, _) = makeSUT()

    getAndCacheSplashScreenTimePeriods(sut: sut, assert: { XCTAssertFalse($0) }) {

        self.awaitActorThreadHop()
        httpClient.complete(with: anyError())
    }
}

// Helper
private func getAndCacheSplashScreenTimePeriods(
    sut: SUT,
    assert: @escaping (Bool) -> Void = { _ in },
    on action: () -> Void,
    timeout: TimeInterval = 1.0
) {
    let exp = expectation(description: "wait for completion")

    sut.getAndCacheSplashScreenTimePeriods {

        assert($0)
        exp.fulfill()
    }

    action()

    wait(for: [exp], timeout: 1.0)
}
```

### Pattern 3: Testing Cache Interactions

From `RootViewModelFactory+loadCachedOperatorsTests.swift`:

```swift
func test_loadCachedOperators_shouldCallLocalAgent() {

    let (sut, localAgent) = makeSUT()

    sut.loadCachedOperators(payload: makePayload()) { _ in }

    XCTAssertEqual(localAgent.loadCallCount, 1)
}

// makeSUT with cached data
private func makeSUT(
    loadStub: ServicePaymentOperatorStorage? = nil
) -> (sut: SUT, localAgent: LocalAgent) {

    let localAgent = LocalAgent(loadStub: loadStub)
    let model: Model = .mockWithEmptyExcept(localAgent: localAgent)
    let sut = super.makeSUT(model: model).sut

    return (sut, localAgent)
}
```

### Pattern 4: Testing Serial Parameter in Requests

```swift
func test_shouldRequestWithNilSerial_onFirstCall() {

    let (sut, httpClient, _) = makeSUT()  // No cached data

    sut.getFastPaymentsButtonList { _ in }

    self.awaitActorThreadHop()
    httpClient.complete(with: anyError())

    // Assert serial query param is nil/missing
    let queryItems = httpClient.queryItems.first ?? []
    let serialItem = queryItems.first { $0.name == "serial" }
    XCTAssertNil(serialItem?.value)
}

func test_shouldRequestWithCachedSerial_onCachedData() {

    let cachedSerial = "cached-serial-123"
    let localAgent = LocalAgentMock(stubs: [(cachedItems, cachedSerial)])
    let (sut, httpClient, _) = makeSUT(model: .mockWithEmptyExcept(localAgent: localAgent))

    sut.getFastPaymentsButtonList { _ in }

    self.awaitActorThreadHop()
    httpClient.complete(with: anyError())

    // Assert serial query param matches cached
    let queryItems = httpClient.queryItems.first ?? []
    let serialItem = queryItems.first { $0.name == "serial" }
    XCTAssertEqual(serialItem?.value, cachedSerial)
}
```

### Pattern 5: Testing Cache Updates

```swift
func test_shouldCacheItems_onRemoteSuccess() {

    let localAgent = LocalAgentMock()
    let (sut, httpClient, _) = makeSUT(model: .mockWithEmptyExcept(localAgent: localAgent))

    expect(sut: sut) {
        self.awaitActorThreadHop()
        try? httpClient.complete(with: successResponse())
        self.awaitActorThreadHop()
    }

    XCTAssertEqual(localAgent.storeCallCount, 1)
    // Verify stored values
    let storedItems = localAgent.getStoredValues(ofType: [CodableItem].self)
    XCTAssertFalse(storedItems.isEmpty)
}

func test_shouldPreserveCache_onRemoteFailure() {

    let localAgent = LocalAgentMock(stubs: [(existingItems, "existing-serial")])
    let (sut, httpClient, _) = makeSUT(model: .mockWithEmptyExcept(localAgent: localAgent))

    expect(sut: sut) {
        self.awaitActorThreadHop()
        httpClient.complete(with: anyError())
    }

    // Cache should not be updated on failure
    XCTAssertEqual(localAgent.storeCallCount, 0)
}
```

## Response JSON Fixtures

Define response JSON as private extensions:

```swift
private extension String {

    static let getFastPaymentsButtonListResponse = """
{
  "statusCode": 0,
  "errorMessage": null,
  "data": {
    "serial": "abc123",
    "list": [
      {
        "action": { "type": "transfer" },
        "background": "#FF0000",
        "icon": "icon.png",
        "svgImage": null,
        "title": "Transfer"
      }
    ]
  }
}
"""
}

private func responseData() throws -> Data {
    return try XCTUnwrap(Data(String.getFastPaymentsButtonListResponse.utf8))
}
```

## Typical Test Structure

```swift
final class RootViewModelFactory_getFastPaymentsButtonListTests: RootViewModelFactoryTests {

    // MARK: - Initial Call (No Cache)

    func test_shouldRequestWithNilSerial_onFirstCall() { ... }
    func test_shouldDeliverRemoteItems_onRemoteSuccess() { ... }
    func test_shouldCacheItems_onRemoteSuccess() { ... }

    // MARK: - Subsequent Call (With Cache)

    func test_shouldRequestWithCachedSerial_onCachedData() { ... }
    func test_shouldDeliverCachedItems_onRemoteSuccessWithSameSerial() { ... }
    func test_shouldNotUpdateCache_onRemoteSuccessWithSameSerial() { ... }
    func test_shouldDeliverNewItems_onRemoteSuccessWithDifferentSerial() { ... }
    func test_shouldUpdateCache_onRemoteSuccessWithDifferentSerial() { ... }

    // MARK: - Remote Failure

    func test_shouldDeliverFallbackItems_onRemoteFailure() { ... }
    func test_shouldPreserveCache_onRemoteFailure() { ... }

    // MARK: - Helpers

    private func makeSUT(...) -> (...) { ... }
    private func expect(sut:assert:on:) { ... }
    private func makeItem(...) -> Item { ... }
}
```

## Key Files Reference

| File | Purpose |
|------|---------|
| `RootViewModelFactoryTests.swift` | Base test class with `makeSUT()` |
| `SplashScreenRootViewModelFactoryTests.swift` | Example subclass with domain helpers |
| `RootViewModelFactoryServiceCategoryTests.swift` | HTTPClientSpy extensions for assertions |
| `HTTPClientSpy.swift` | HTTP client test double |
| `HTTPClientSpy+ext.swift` | Query parameter helpers |
| `LocalAgentMock.swift` | Cache test double |
| `Model+mockWithEmptyExcept.swift` | Model factory for tests |
| `XCTestCase+awaitActorThreadHop.swift` | Async wait helper |
