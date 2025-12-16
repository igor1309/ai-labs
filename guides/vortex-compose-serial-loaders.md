---
context: Vortex project
---

## Overview

`composeSerialLoaders` creates paired local/remote loaders with serial-based cache invalidation (similar to HTTP ETag). Use when you need:
- Local cache delivery for instant UI
- Remote fetch with conditional GET (serial comparison)
- Automatic cache update on new data

## Signature

```swift
func composeSerialLoaders<Value, Model: Codable>(
    remoteLoader: @escaping SerialLoader<Value>,
    fromModel: @escaping (Model) -> Value,
    toModel: @escaping (Value) -> Model
) -> (local: Load<Value?>, remote: Load<Value?>)
```

Where:
```swift
typealias SerialLoader<Value> = (String?, @escaping (Result<SerialStamped<String, Value>, Error>) -> Void) -> Void
typealias Load<T> = (@escaping (T) -> Void) -> Void
```

## Behavior Matrix

| Condition | Local Loader | Remote Loader |
|-----------|--------------|---------------|
| No cache | `nil` | Fetches, stores, delivers new value |
| Cache exists, remote fails | N/A | Delivers cached via `fromModel` |
| Cache exists, same serial | N/A | Delivers cached via `fromModel`, skips store |
| Cache exists, new serial | N/A | Stores via `toModel`, delivers new value |

## Implementation Steps

### 1. Define Domain Types

```swift
// Domain value type (non-Codable, used in UI)
struct MyFeatureData: Equatable {
    let items: [Item]
}

// Codable model for cache storage
struct CodableMyFeatureData: Codable, Equatable {
    let items: [CodableItem]
}
```

### 2. Create Mapping Extensions

```swift
// Cache → Domain
private extension CodableMyFeatureData {
    var domainValue: MyFeatureData {
        .init(items: items.map(\.domainItem))
    }
}

// Domain → Cache
private extension MyFeatureData {
    var codable: CodableMyFeatureData {
        .init(items: items.map(\.codable))
    }
}

// API Response → SerialStamped
private extension MyFeatureResponse {
    var stamped: SerialStamped<String, MyFeatureData> {
        .init(
            value: .init(items: responseItems.map { .init($0) }),
            serial: serial
        )
    }
}
```

### 3. Create Remote Loader

```swift
let remoteLoader = nanoServiceComposer.compose(
    makeRequest: { try RequestFactory.createMyFeatureRequest($0) },
    mapResponse: { ResponseMapper.mapMyFeatureResponse($0, $1).map(\.stamped) }
)
```

The `makeRequest` closure receives optional serial (`String?`) for conditional GET.
The `mapResponse` must return `Result<SerialStamped<String, Value>, Error>`.

### 4. Compose Loaders

```swift
let (local, remote) = composeSerialLoaders(
    remoteLoader: remoteLoader,
    fromModel: { $0.domainValue },  // CodableMyFeatureData → MyFeatureData
    toModel: { $0.codable }          // MyFeatureData → CodableMyFeatureData
)
```

### 5. Use Loaders

```swift
// For instant cache delivery
local { cachedValue in
    // cachedValue: MyFeatureData?
}

// For fresh data with fallback
remote { value in
    // value: MyFeatureData?
}
```

## Reference Files

### Production Code
- `RootViewModelFactory+composeSerialLoaders.swift` — main implementation
- `RootViewModelFactory+makeBannersContent.swift` — usage example with banners

### Tests
- `RootViewModelFactory+composeSerialLoadersTests.swift` — comprehensive test suite

### Supporting Infrastructure
- `LoggingRemoteNanoServiceComposer.swift` — creates remote loaders
- `SerialLoaderComposer.swift` — alternative composer (array-based)

## Key Points

1. `Model` must be `Codable` — it's stored in `LocalAgent`
2. `Value` can be any `Equatable` type — used in domain/UI layer
3. Serial comparison happens in remote loader — same serial = no store, deliver cached
4. On remote failure — cache is preserved, cached value delivered (or `nil`)
5. `fromModel` called only when delivering cached data
6. `toModel` called only when storing new remote data

## Testing Pattern

Reference: `RootViewModelFactory+composeSerialLoadersTests.swift`

```swift
private func makeSUT(
    cached: [(any Decodable, String?)]? = nil,
    fromModelStub: [Value]? = nil,
    toModelStub: [CodableValue]? = nil
) -> (sut: SUT, spies: Spies, local: Load<Value?>, remote: Load<Value?>)
```

Key test scenarios:
- Remote failure with/without cache
- Same serial (no store)
- New serial (store + deliver)
- Serial passing to remote loader
- Local loader behavior
- Mapper call verification (`fromModel`/`toModel`)
