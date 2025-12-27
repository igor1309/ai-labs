---
date: 2025-12-02
model: gpt-5
description: "Response mapping guide for swift-vortex with DTOs, domain models, and test coverage patterns."
---

# Swift Vortex: Response Mapping with Test Coverage

This guide explains how to create response mappers in swift-vortex with comprehensive test coverage.

## Overview

Response mapping transforms raw JSON `Data` + `HTTPURLResponse` into domain models. The pattern uses:
- Private DTO structs with **all optional** fields for safe JSON decoding
- Public domain models where optionality depends on requirements
- `compactMap` to filter out invalid items in lists

## Response Types

Choose the appropriate response type based on API structure:

| Scenario | Response Type | Reference |
|----------|---------------|-----------|
| List with serial | `SerialStamped<String, Item>` | `mapGetOpenProductListResponse` |
| Single object | Direct domain model | `mapGetOperationDetailResponse` |
| Simple value | Custom wrapper | `mapShowCVVResponse` |

## File Structure

```
swift-vortex/
├── Sources/Feature/{ModuleName}/Backend/ResponseMapper/{MethodName}/
│   ├── ResponseMapper+map{ResponseName}Response.swift  # Mapper + DTOs
│   └── {DomainModelName}.swift                         # Public domain model
└── Tests/Feature/{ModuleName}/Backend/ResponseMapper/{MethodName}/
    └── ResponseMapper+map{ResponseName}ResponseTests.swift
```

## Part I: Domain Model

Create the public domain model first. Reference: `GetOpenProductListItem.swift`

### Key Rules

1. **Top-level public type** (not nested under `ResponseMapper`)
2. **Optionality based on requirements**, not JSON structure
3. **Equatable conformance** for testing
4. **Explicit public initializers** with all parameters

```swift
import Foundation

public struct MyItem: Equatable {

    public let requiredField: String    // Non-optional = required
    public let optionalField: String?   // Optional = can be missing

    public init(
        requiredField: String,
        optionalField: String?
    ) {
        self.requiredField = requiredField
        self.optionalField = optionalField
    }
}

// Nested types for complex structures
extension MyItem {

    public struct NestedType: Equatable {

        public let value: String

        public init(value: String) {
            self.value = value
        }
    }
}
```

## Part II: Response Mapper + DTOs

Create mapper with private DTOs. Reference: `ResponseMapper+mapGetOpenProductListResponse.swift`

### Structure

```swift
import Foundation
import RemoteServices

// MARK: - Public API

public extension ResponseMapper {

    typealias MyResponse = SerialStamped<String, MyItem>  // or just MyItem for single item

    static func mapMyResponse(
        _ data: Data,
        _ httpURLResponse: HTTPURLResponse
    ) -> MappingResult<MyResponse> {

        map(data, httpURLResponse, mapOrThrow: MyResponse.init(data:))
    }
}

// MARK: - Response Mapping (private)

private extension ResponseMapper.MyResponse {

    init(data: DTO) throws {

        guard let serial = data.serial,
              let content = data.content
        else { throw MissingRequiredField() }

        self.init(
            list: content.compactMap { try? .init(data: $0) },  // Invalid items dropped
            serial: serial
        )
    }
}

// MARK: - Item Mapping (private)

private extension MyItem {

    init(data: DTO.Item) throws {

        guard let requiredField = data.requiredField
        else { throw MissingRequiredField() }

        let nested = try data.nestedValue

        self.init(
            requiredField: requiredField,
            optionalField: data.optionalField,
            nested: nested
        )
    }
}

// MARK: - DTOs (file-private, ALL FIELDS OPTIONAL)

private struct DTO: Decodable {

    let serial: String?
    let content: [Item]?
}

private extension DTO {

    struct Item: Decodable {

        let requiredField: String?   // OPTIONAL in DTO
        let optionalField: String?
        let nested: Nested?
    }

    struct Nested: Decodable {

        let value: String?           // OPTIONAL in DTO
    }
}

// MARK: - DTO to Domain Helpers (private)

private extension DTO.Item {

    /// Throws if nested exists but is invalid
    var nestedValue: MyItem.NestedType? {
        get throws {
            guard let nested else { return nil }

            guard let value = nested.value
            else { throw MissingRequiredField() }

            return .init(value: value)
        }
    }
}

private struct MissingRequiredField: Error {}
```

### Alternative: Single Object Response (no SerialStamped)

For responses that return a single object instead of a list. Reference: `ResponseMapper+mapGetOperationDetailResponse.swift`

```swift
import Foundation
import RemoteServices

// MARK: - Public API

public extension ResponseMapper {

    static func mapMyObjectResponse(
        _ data: Data,
        _ httpURLResponse: HTTPURLResponse
    ) -> MappingResult<MyObject> {

        map(data, httpURLResponse, mapOrThrow: map)
    }
}

// MARK: - Mapping (private)

private extension ResponseMapper {

    static func map(_ data: DTO) throws -> MyObject {
        try data.response
    }
}

private struct DTO: Decodable {

    let requiredField: String?   // ALL OPTIONAL
    let optionalField: String?
}

private extension DTO {

    var response: MyObject {
        get throws {
            guard let requiredField else { throw MissingMandatoryFields() }

            return .init(
                requiredField: requiredField,
                optionalField: optionalField
            )
        }
    }

    struct MissingMandatoryFields: Error {}
}
```

### Key Patterns

#### Pattern 1: Required Field Missing = Item Dropped
```swift
guard let requiredField = item.requiredField
else { throw MissingRequiredField() }
```

#### Pattern 2: Optional Field Missing = OK
```swift
self.init(
    optionalField: item.optionalField  // Passes through nil
)
```

#### Pattern 3: Optional Nested That Can Be Invalid
```swift
var nestedValue: NestedType? {
    get throws {
        guard let nested else { return nil }  // Missing = nil (OK)
        guard let value = nested.value
        else { throw MissingRequiredField() }  // Present but invalid = throw
        return .init(value: value)
    }
}

// Usage in init
let nested = try item.nestedValue
```

#### Pattern 4: Validation (e.g., hex colors)
```swift
var _background: String? {
    guard let background, background.isValidHexColor
    else { return nil }
    return background
}

// Private helper
private extension String {
    var isValidHexColor: Bool {
        let hexPattern = "^#?([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$"
        return range(of: hexPattern, options: .regularExpression) != nil
    }
}
```

## Part III: Tests

Reference: `ResponseMapper+mapGetOpenProductListResponseTests.swift`

### Style Notes

- Keep simple assertions on single lines when readable
- Use multiline only for complex assertions with many parameters
- Empty line after each `func` declaration

### Test Categories

1. **Invalid data handling** (empty, malformed JSON)
2. **Server error handling**
3. **Missing required fields** (item should be dropped)
4. **Missing optional fields** (item should be included)
5. **Invalid nested data** (item should be dropped)
6. **Non-200 HTTP responses**
7. **Valid data mapping**
8. **Optional (advised): Live/production JSON** (real API response)

### Test Structure

```swift
import {ModuleName}Backend
import RemoteServices
import XCTest

final class ResponseMapper_map{Name}ResponseTests: XCTestCase {

    // MARK: - Invalid Data

    func test_map_shouldDeliverInvalidFailure_onEmptyData() {
        XCTAssertNoDiff(map(.empty), .failure(.invalid(statusCode: 200, data: .empty)))
    }

    func test_map_shouldDeliverInvalidFailure_onInvalidData() {
        assertInvalid(.invalidData)
    }

    func test_map_shouldDeliverInvalidFailure_onEmptyJSON() {
        assertInvalid(.emptyJSON)
    }

    func test_map_shouldDeliverInvalidFailure_onEmptyDataResponse() {
        assertInvalid(.emptyDataResponse)
    }

    func test_map_shouldDeliverInvalidFailure_onNullServerResponse() {
        assertInvalid(.nullServerResponse)
    }

    // MARK: - Server Error

    func test_map_shouldDeliverServerError_onServerError() {
        assertServerError(.serverError, message: "Возникла техническая ошибка")
    }

    // MARK: - Missing Required Fields (item dropped)

    func test_map_shouldDeliverInvalid_onMissingSerial() {
        assertInvalid(.missingSerial)
    }

    func test_map_shouldDeliverInvalid_onMissingContent() {
        assertInvalid(.missingContent)
    }

    func test_map_shouldNotDeliverOneWithMissingRequiredField() {
        assert(.missingRequiredField, mapsTo: .validSecond())
    }

    // MARK: - Missing Optional Fields (item included)

    func test_map_shouldDeliverOneWithMissingOptionalField() {
        assert(.missingOptionalField, mapsTo: .validFirst(optionalField: nil), .validSecond())
    }

    // MARK: - HTTP Response

    func test_map_shouldDeliverInvalidFailure_onNonOkHTTPResponse() {
        for statusCode in [199, 201, 399, 400, 401, 404] {
            let nonOkResponse = anyHTTPURLResponse(statusCode: statusCode)
            assertInvalid(.validData, nonOkResponse)
        }
    }

    // MARK: - Valid Data

    func test_map_shouldDeliverResponse_onValidData() {
        assert(.validData, mapsTo: .validFirst(), .validSecond())
    }

    // MARK: - Live Data

    func test_map_live() {
        assert(
            .live,
            serial: "actual-serial-from-response",
            mapsTo: .init(...),  // Expected items from real response
            .init(...)
        )
    }

    // MARK: - Helpers

    private typealias Response = ResponseMapper.MyResponse
    private typealias MappingResult = ResponseMapper.MappingResult<Response>

    private func map(
        _ data: Data,
        _ httpURLResponse: HTTPURLResponse = anyHTTPURLResponse()
    ) -> MappingResult {
        ResponseMapper.mapMyResponse(data, httpURLResponse)
    }

    private func assert(
        _ data: String,
        serial: String = "test-serial",
        mapsTo list: MyItem...,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertNoDiff(
            map(data.json),
            .success(.init(list: list, serial: serial)),
            file: file, line: line
        )
    }

    private func assertInvalid(
        _ data: String,
        _ httpURLResponse: HTTPURLResponse = anyHTTPURLResponse(),
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertNoDiff(
            map(data.json, httpURLResponse),
            .failure(.invalid(statusCode: httpURLResponse.statusCode, data: data.json)),
            file: file, line: line
        )
    }

    private func assertServerError(
        _ data: String,
        message: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertNoDiff(
            map(data.json),
            .failure(.server(statusCode: 102, errorMessage: message)),
            file: file, line: line
        )
    }
}
```

### Test Fixtures

```swift
// MARK: - Response Factories

private extension ResponseMapper.MyResponse {

    static func validData(
        list: [MyItem],
        serial: String = "test-serial"
    ) -> Self {
        .init(list: list, serial: serial)
    }
}

private extension MyItem {

    static func validFirst(
        requiredField: String = "value1",
        optionalField: String? = "optional1"
    ) -> Self {
        .init(requiredField: requiredField, optionalField: optionalField)
    }

    static func validSecond(
        requiredField: String = "value2",
        optionalField: String? = "optional2"
    ) -> Self {
        .init(requiredField: requiredField, optionalField: optionalField)
    }
}

// MARK: - Data Helpers

private extension Data {
    static let empty: Data = .init()
}

private extension String {
    var json: Data { .init(self.utf8) }

    static let invalidData = """
    { "statusCode": 102, "errorMessage": null, "data": { "a": "junk" } }
    """

    static let emptyJSON = "{}"

    static let emptyDataResponse = """
    { "statusCode": 102, "errorMessage": null, "data": {} }
    """

    static let nullServerResponse = """
    { "statusCode": 0, "errorMessage": null, "data": null }
    """

    static let serverError = """
    { "statusCode": 102, "errorMessage": "Возникла техническая ошибка", "data": null }
    """

    static let missingSerial = """
    {
      "statusCode": 0,
      "errorMessage": null,
      "data": {
        "content": [\(firstItem), \(secondItem)]
      }
    }
    """

    static let missingContent = """
    {
      "statusCode": 0,
      "errorMessage": null,
      "data": {
        "serial": "test-serial"
      }
    }
    """

    static let validData = """
    {
      "statusCode": 0,
      "errorMessage": null,
      "data": {
        "serial": "test-serial",
        "content": [\(firstItem), \(secondItem)]
      }
    }
    """

    static let firstItem = """
    { "requiredField": "value1", "optionalField": "optional1" }
    """

    static let secondItem = """
    { "requiredField": "value2", "optionalField": "optional2" }
    """

    // Real API response for regression testing
    static let live = """
    { ... actual JSON from production ... }
    """
}
```

## Running Tests

```bash
cd swift-vortex && \
xcodebuild test -quiet \
  -scheme {ModuleName}Backend \
  -destination 'platform=iOS Simulator,id={SimulatorID}' \
  | xcpretty -s \
&& cd ..
```

## Checklist

- [ ] Domain model with correct optionality based on requirements
- [ ] All DTO fields are optional
- [ ] File-private DTOs (`DTO` + nested DTO types)
- [ ] `compactMap` for list items to drop invalid entries
- [ ] Throwing `init(data:)` for items + `compactMap { try? }`
- [ ] Throwing getters for optional nested types that can be invalid
- [ ] Tests for empty/invalid/malformed data
- [ ] Tests for server errors
- [ ] Tests for missing required fields (item dropped)
- [ ] Tests for missing optional fields (item included)
- [ ] Tests for non-200 HTTP status codes
- [ ] Tests for valid data
- [ ] Optional (advised): test with live/production JSON
- [ ] `XCTAssertNoDiff` for better failure messages
