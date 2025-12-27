---
date: 2025-12-27
model: gpt-5.2
description: "Single source of truth for swift-vortex backend response mapping (models, DTOs, tests)."
---

# Swift Vortex: Backend Response Mapping Guide

## Overview

Response mapping transforms raw JSON `Data` + `HTTPURLResponse` into domain models. The standard pattern uses:
- File-private DTOs with all optional fields for safe decoding.
- A validation layer that throws on missing required fields.
- Public domain models with required fields non-optional and Swift-idiomatic naming.
- `compactMap { try? }` to drop invalid list items.

## Prerequisites

Required inputs:
1. **Module Name**: Feature module (e.g., "TransGran", "ProductProfile").
2. **Method Name**: Backend method (e.g., "GetSomethingList").
3. **JSON Schema**: Expected backend response structure.

Retrieve:
- **Git User**: `git config user.name` for file headers.
- **Current Date**: `DD.MM.YYYY` format for file headers.

## Path Structure

- **Production**: `Sources/Feature/{ModuleName}/Backend/ResponseMapper/{MethodName}/`
- **Tests**: `Tests/Feature/{ModuleName}/Backend/ResponseMapper/{MethodName}/`
- **Test Import**: `{ModuleName}Backend` module

```
swift-vortex/
├── Sources/Feature/{ModuleName}/Backend/ResponseMapper/{MethodName}/
│   ├── ResponseMapper+map{ResponseName}Response.swift  # Mapper + DTOs
│   └── {DomainModelName}.swift                         # Public domain model
└── Tests/Feature/{ModuleName}/Backend/ResponseMapper/{MethodName}/
    └── ResponseMapper+map{ResponseName}ResponseTests.swift
```

## Architecture: Three-Layer Decoding

1. **DTO (Data Transfer Object)**: All properties optional, matches JSON keys exactly, implements `Decodable`.
2. **Validation Layer**: Private `init(data:)` throws, validates required fields with `guard let`.
3. **Public Model**: Non-optional required fields, Swift-idiomatic naming, implements `Equatable`.

## Naming Conventions

### Identifiers
- **Public API**: `ID` suffix (e.g., `methodID`, `itemID`).
- **DTO**: `Id` suffix (e.g., `methodId`, `itemId`) to match JSON without CodingKeys.

### Reserved Keywords
- **DTO**: Wrap in backticks regardless of type (e.g., ``default``, ``return``, ``case``).
- **Public API**: Rename appropriately.
  - If Bool: use `is-` prefix (``default`` -> `isDefault`).
  - If not Bool: use semantic name (``case`` -> `caseType`).

### Booleans
- **Public API**: Always `is-` prefix (`isDefault`, `isActive`, `isEnabled`).
- **DTO**: Keep original JSON key with backticks if reserved keyword.

### Types and Scope
- **Public Types and Typealiases**: Module top-level to avoid namespace pollution.
- **DTOs**: File-private `DTO` and `DTO.{NestedType}` (simple names).
- **Errors**: File-private `MissingRequiredField`.

### Numeric Literals
- **Swift code**: Use underscores (e.g., `10_000`, `1_000_000`).
- **JSON fixtures**: No underscores (JSON does not support them).

### JSON Formatting
- **Test fixtures**: Always pretty printed JSON with proper indentation.
- Use 2 spaces for indentation.
- Each object property on its own line.
- Each array item on its own line for readability.

### Test Formatting
- **Empty line**: Always add an empty line between test function name and test body.
- **Test Fixture Arrays**: Extract repeated fixture arrays into well-named private constants.
  - Use descriptive names like `singleItemMissingRequiredFieldFixtures`, `secondItemMissingRequiredFieldFixtures`.

## Response Types

Choose the response type based on API structure:

| Scenario | Response Type | Reference |
|----------|---------------|-----------|
| List with serial | `SerialStamped<String, Item>` | `mapGetOpenProductListResponse` |
| Single object | Direct domain model | `mapGetOperationDetailResponse` |
| Simple value | Custom wrapper | `mapShowCVVResponse` |

## Domain Model Guidelines

Create the public domain model first.

### Key Rules

1. **Top-level public type** (not nested under `ResponseMapper`).
2. **Optionality based on requirements**, not JSON structure.
3. **Equatable conformance** for testing.
4. **Explicit public initializers** with all parameters.

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

## SerialStamped Pattern (Primary)

**Use when**: JSON is `{ serial: "...", {listField}: [...] }`
- Serial field always named `serial`.
- List field varies: `list`, `items`, `countries`, etc.

### File 1: Public Model
**Path**: `Sources/Feature/{ModuleName}/Backend/ResponseMapper/{MethodName}/{MethodName}.swift`

```swift
//
//  {MethodName}.swift
//  swift-vortex
//
//  Created by {GIT_USER} on {DATE}.
//

import Foundation

public struct {ItemType}: Equatable {

    public let {field1}: {Type1}
    public let {field2}: {Type2}

    public init(
        {field1}: {Type1},
        {field2}: {Type2}
    ) {
        self.{field1} = {field1}
        self.{field2} = {field2}
    }
}
```

### File 2: Mapper
**Path**: `Sources/Feature/{ModuleName}/Backend/ResponseMapper/{MethodName}/ResponseMapper+map{MethodName}Response.swift`

```swift
//
//  ResponseMapper+map{MethodName}Response.swift
//  swift-vortex
//
//  Created by {GIT_USER} on {DATE}.
//

import Foundation
import RemoteServices

public typealias {MethodName} = SerialStamped<String, {ItemType}>

public extension ResponseMapper {

    static func map{MethodName}Response(
        _ data: Data,
        _ httpURLResponse: HTTPURLResponse
    ) -> MappingResult<{MethodName}> {

        map(data, httpURLResponse, mapOrThrow: {MethodName}.init(data:))
    }
}

private extension {MethodName} {

    init(data: DTO) throws {

        guard let serial = data.serial,
              let {listField} = data.{listField}
        else { throw MissingRequiredField() }

        self.init(
            list: {listField}.compactMap { try? .init(data: $0) },
            serial: serial
        )
    }
}

private extension {ItemType} {

    init(data: DTO.{ItemType}) throws {

        guard let {fieldId} = data.{fieldId},
              let {otherField} = data.{otherField}
        else { throw MissingRequiredField() }

        self.init(
            {fieldID}: {fieldId},
            {otherField}: {otherField}
        )
    }
}

private struct DTO: Decodable {

    let serial: String?
    let {listField}: [{ItemType}]?
}

private extension DTO {

    struct {ItemType}: Decodable {

        let {fieldId}: String?
        let {otherField}: {Type}?
    }
}

private struct MissingRequiredField: Error {}
```

### File 3: Tests
**Path**: `Tests/Feature/{ModuleName}/Backend/ResponseMapper/{MethodName}/ResponseMapper_map{MethodName}ResponseTests.swift`

```swift
//
//  ResponseMapper_map{MethodName}ResponseTests.swift
//  swift-vortex
//
//  Created by {GIT_USER} on {DATE}.
//

import {ModuleName}Backend
import RemoteServices
import XCTest

final class ResponseMapper_map{MethodName}ResponseTests: XCTestCase {

    func test_map_shouldDeliverInvalidFailure_onInvalidJSON() {

        for data in [Data.empty, .emptyJSON, .emptyDataResponse, .nullServerResponse] {

            assertInvalid(data)
        }
    }

    func test_map_shouldDeliverServerError_onServerError() {

        assertServerError(.serverError, message: "Возникла техническая ошибка")
    }

    func test_map_shouldDeliverInvalidFailure_onNonOkHTTPResponse() {

        for statusCode in [199, 201, 399, 400, 401, 404] {

            assertInvalid(.valid, anyHTTPURLResponse(statusCode: statusCode))
        }
    }

    func test_map_shouldDeliverResponse_onValidData() {

        assert(.valid, mapsTo: makeDefaultResponse())
    }

    func test_map_shouldDeliverResponse_onEmpty{ListName}() {

        assert(.empty{ListName}, mapsTo: makeResponse(list: []))
    }

    func test_map_shouldDeliverInvalidFailure_onMissingSerial() {

        assertInvalid(.missingSerial)
    }

    func test_map_shouldDeliverInvalidFailure_onMissing{ListField}() {

        assertInvalid(.missing{ListField})
    }

    func test_map_shouldDeliverResponse_withEmptyList_whenSingleItemHasMissingRequiredFields() {

        for data in singleItemMissingRequiredFieldFixtures {

            assert(data, mapsTo: makeResponse(list: []))
        }
    }

    func test_map_shouldDeliverResponse_skippingItemsWithMissingRequiredFields() {

        for data in secondItemMissingRequiredFieldFixtures {

            assert(data, mapsTo: makeResponse(list: [make{ItemType}()]))
        }
    }

    func test_map_shouldDeliverResponse_withEmptyList_whenAllItemsHaveMissingRequiredFields() {

        for data in allItemsMissingRequiredFieldFixtures {

            assert(data, mapsTo: makeResponse(list: []))
        }
    }

    // MARK: - Helpers

    private typealias Response = {MethodName}
    private typealias MappingResult = ResponseMapper.MappingResult<Response>

    private let singleItemMissingRequiredFieldFixtures: [String] = [
        .missing{Field1},
        .missing{Field2}
    ]

    private let secondItemMissingRequiredFieldFixtures: [String] = [
        .secondItemMissing{Field1},
        .secondItemMissing{Field2}
    ]

    private let allItemsMissingRequiredFieldFixtures: [String] = [
        .allItemsMissing{Field1},
        .allItemsMissing{Field2}
    ]

    private func map(
        _ data: Data,
        _ httpURLResponse: HTTPURLResponse = anyHTTPURLResponse()
    ) -> MappingResult {

        ResponseMapper.map{MethodName}Response(data, httpURLResponse)
    }

    private func assertInvalid(
        _ string: String,
        _ httpURLResponse: HTTPURLResponse = anyHTTPURLResponse(),
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertNoDiff(map(string.json, httpURLResponse), .failure(.invalid(statusCode: httpURLResponse.statusCode, data: string.json)), file: file, line: line)
    }

    private func assertInvalid(
        _ data: Data,
        _ httpURLResponse: HTTPURLResponse = anyHTTPURLResponse(),
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertNoDiff(map(data, httpURLResponse), .failure(.invalid(statusCode: httpURLResponse.statusCode, data: data)), file: file, line: line)
    }

    private func assertServerError(
        _ string: String,
        message: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertNoDiff(map(string.json), .failure(.server(statusCode: 102, errorMessage: message)), file: file, line: line)
    }

    private func assert(
        _ string: String,
        mapsTo response: Response,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertNoDiff(map(string.json), .success(response), file: file, line: line)
    }

    private func makeDefaultResponse() -> Response {

        makeResponse(list: [make{ItemType}()])
    }

    private func makeResponse(
        list: [{ItemType}],
        serial: String = "bea36075a58954199a6b8980549f6b69"
    ) -> Response {

        return .init(list: list, serial: serial)
    }

    private func make{ItemType}(
        {field1}: {Type1} = {defaultValue1},
        {field2}: Int = 10_000
    ) -> {ItemType} {

        return .init(
            {field1}: {field1},
            {field2}: {field2}
        )
    }
}

private extension String {
    static let valid = """
{
  "statusCode": 0,
  "errorMessage": null,
  "data": {
    "serial": "bea36075a58954199a6b8980549f6b69",
    "{listField}": [
      {
        "{field1}": "{value1}",
        "{field2}": 10000
      }
    ]
  }
}
"""

    static let empty{ListName} = """
{
  "statusCode": 0,
  "errorMessage": null,
  "data": {
    "serial": "bea36075a58954199a6b8980549f6b69",
    "{listField}": []
  }
}
"""

    static let missingSerial = """
{
  "statusCode": 0,
  "errorMessage": null,
  "data": {
    "{listField}": [
      {
        "{field1}": "{value1}",
        "{field2}": 10000
      }
    ]
  }
}
"""

    static let missing{ListField} = """
{
  "statusCode": 0,
  "errorMessage": null,
  "data": {
    "serial": "bea36075a58954199a6b8980549f6b69"
  }
}
"""

    static let missing{Field1} = """
{
  "statusCode": 0,
  "errorMessage": null,
  "data": {
    "serial": "bea36075a58954199a6b8980549f6b69",
    "{listField}": [
      {
        "{field2}": 10000
      }
    ]
  }
}
"""

    // Partial failures - one fixture per required field
    static let secondItemMissing{Field1} = """
{
  "statusCode": 0,
  "errorMessage": null,
  "data": {
    "serial": "bea36075a58954199a6b8980549f6b69",
    "{listField}": [
      {
        "{field1}": "{value1}",
        "{field2}": 10000
      },
      {
        "{field2}": 20000
      }
    ]
  }
}
"""

    static let secondItemMissing{Field2} = """
{
  "statusCode": 0,
  "errorMessage": null,
  "data": {
    "serial": "bea36075a58954199a6b8980549f6b69",
    "{listField}": [
      {
        "{field1}": "{value1}",
        "{field2}": 10000
      },
      {
        "{field1}": "{value2}"
      }
    ]
  }
}
"""

    // All items invalid - one fixture per required field
    static let allItemsMissing{Field1} = """
{
  "statusCode": 0,
  "errorMessage": null,
  "data": {
    "serial": "bea36075a58954199a6b8980549f6b69",
    "{listField}": [
      {
        "{field2}": 10000
      },
      {
        "{field2}": 20000
      }
    ]
  }
}
"""

    static let allItemsMissing{Field2} = """
{
  "statusCode": 0,
  "errorMessage": null,
  "data": {
    "serial": "bea36075a58954199a6b8980549f6b69",
    "{listField}": [
      {
        "{field1}": "{value1}"
      },
      {
        "{field1}": "{value2}"
      }
    ]
  }
}
"""
}
```

### Conditional Tests (Add When Applicable)

Add these when optional or nested fields exist. If you include optional fields, update your factory to accept them.

```swift
func test_map_shouldDeliverResponse_withNilOptionalField_onMissingOptionalField() {

    assert(.missingOptional{Field}, mapsTo: makeResponse(list: [make{ItemType}({optionalField}: nil)]))
}

func test_map_shouldDeliverResponse_withEmptyList_onInvalidNestedData() {

    assert(.invalidNested{Field}, mapsTo: makeResponse(list: []))
}
```

### Conditional Fixtures (Add When Applicable)

Ensure your valid fixture includes `{optionalField}` and `{nestedField}` so these variants are meaningful. Merge these into the existing `private extension String` for fixtures.

```swift
private extension String {
    static let missingOptional{Field} = """
{
  "statusCode": 0,
  "errorMessage": null,
  "data": {
    "serial": "bea36075a58954199a6b8980549f6b69",
    "{listField}": [
      {
        "{field1}": "{value1}",
        "{field2}": 10000
      }
    ]
  }
}
"""

    static let invalidNested{Field} = """
{
  "statusCode": 0,
  "errorMessage": null,
  "data": {
    "serial": "bea36075a58954199a6b8980549f6b69",
    "{listField}": [
      {
        "{field1}": "{value1}",
        "{field2}": 10000,
        "{nestedField}": {}
      }
    ]
  }
}
"""
}
```

## Custom Struct Pattern

**Use when**: JSON structure is NOT `{ serial: "...", {listField}: [...] }`

```swift
// File 1: Public Model
public struct {MethodName}: Equatable {

    public let {field1}: {Type1}
    public let {field2}: {Type2}

    public init(
        {field1}: {Type1},
        {field2}: {Type2}
    ) {
        self.{field1} = {field1}
        self.{field2} = {field2}
    }
}

// File 2: Mapper for custom struct
public extension ResponseMapper {

    static func map{MethodName}Response(
        _ data: Data,
        _ httpURLResponse: HTTPURLResponse
    ) -> MappingResult<{MethodName}> {

        map(data, httpURLResponse, mapOrThrow: {MethodName}.init(data:))
    }
}

private extension {MethodName} {

    init(data: DTO) throws {

        guard let {field1} = data.{field1},
              let {field2} = data.{field2}
        else { throw MissingRequiredField() }

        self.init(
            {field1}: {field1},
            {field2}: {field2}
        )
    }
}

private struct DTO: Decodable {

    let {field1}: {Type1}?
    let {field2}: {Type2}?
}

private struct MissingRequiredField: Error {}
```

**Note**: If the custom struct contains lists, use `compactMap { try? }` for list mapping.

## Single Object Response (No SerialStamped)

For responses that return a single object instead of a list.

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
            guard let requiredField else { throw MissingRequiredField() }

            return .init(
                requiredField: requiredField,
                optionalField: optionalField
            )
        }
    }
}

private struct MissingRequiredField: Error {}
```

## Simple Value Response

If the response wraps a single value, use a small top-level wrapper model and map it like a custom struct.

```swift
public struct ShowCVV: Equatable {

    public let value: String

    public init(value: String) {
        self.value = value
    }
}
```

## Mapping Rules and Patterns

### Pattern 1: Required Field Missing = Item Dropped
```swift
guard let requiredField = item.requiredField
else { throw MissingRequiredField() }
```

### Pattern 2: Optional Field Missing = OK
```swift
self.init(
    optionalField: item.optionalField  // Passes through nil
)
```

### Pattern 3: Optional Nested That Can Be Invalid
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

### Pattern 4: Validation (e.g., hex colors)
```swift
var background: String? {
    guard let background, background.isValidHexColor
    else { return nil }
    return background
}

private extension String {
    var isValidHexColor: Bool {
        let hexPattern = "^#?([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$"
        return range(of: hexPattern, options: .regularExpression) != nil
    }
}
```

## Critical Rules

1. **Namespace Pollution**: All public types and typealiases at module top-level, not nested in `ResponseMapper`.
2. **List Mapping**: Always `compactMap { try? }` to skip invalid items, never `map { try }`.
3. **Factory Parameters**: No instance method calls as defaults (Swift does not allow it).
4. **Name Collisions**: Use specific names (`emptyCountryList`), not generic (`emptyList`).
5. **Type Mapping**: JSON numbers -> `Int` for counts/IDs, `Double` for money/measurements.

## Required Test Coverage

1. Invalid JSON (4 cases: empty, `emptyJSON`, `emptyDataResponse`, `nullServerResponse`).
2. Server error (statusCode 102).
3. Non-OK HTTP response (199, 201, 399, 400, 401, 404).
4. Valid data.
5. Empty lists.
6. Missing serial (if `SerialStamped`).
7. Missing list field.
8. Missing optional fields (maps to `nil`, item kept) when optional fields exist.
9. Invalid nested data (item dropped) when nested fields exist.
10. Partial failures (one test per required field: skip invalid items, keep valid ones).
11. All items invalid (one test per required field: return empty list).
12. Optional (advised): Live/production JSON regression test.

## Test Structure Notes

- Keep simple assertions on single lines when readable.
- Use multiline only for complex assertions with many parameters.
- Keep an empty line after each `func` declaration.
- Use `XCTAssertNoDiff` for clearer failures.

## Optional: Live/Production JSON Test

```swift
func test_map_live() {

    assert(
        .live,
        serial: "actual-serial-from-response",
        mapsTo: .init(...),
        .init(...)
    )
}
```

## Test Fixtures (Helpers)

```swift
// MARK: - Response Factories

private extension {MethodName} {

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
{
  "statusCode": 102,
  "errorMessage": null,
  "data": {
    "a": "junk"
  }
}
"""

    static let emptyJSON = "{}"

    static let emptyDataResponse = """
{
  "statusCode": 102,
  "errorMessage": null,
  "data": {}
}
"""

    static let nullServerResponse = """
{
  "statusCode": 0,
  "errorMessage": null,
  "data": null
}
"""

    static let serverError = """
{
  "statusCode": 102,
  "errorMessage": "Возникла техническая ошибка",
  "data": null
}
"""

    static let live = """
{
  "...": "actual JSON from production"
}
"""
}
```

## Running Tests

Use `xcodebuild test` following the shared Vortex testing guidelines for the exact scheme, destination, and `-only-testing` usage. See `guides/vortex-project.md`.

## Validation Checklist

- [ ] Correct paths relative to package root.
- [ ] Git user name in headers (`git config user.name`).
- [ ] Imports: `{ModuleName}Backend`, `RemoteServices`.
- [ ] Public types at module top-level.
- [ ] Public API uses `ID` suffix for identifiers.
- [ ] DTOs use `Id` suffix.
- [ ] DTOs and errors file-private with simple names.
- [ ] Reserved keywords in backticks (DTO layer).
- [ ] Booleans use `is-` prefix (public API).
- [ ] List mappings use `compactMap { try? }`.
- [ ] Swift numeric literals use underscores.
- [ ] JSON fixtures no underscores.
- [ ] JSON fixtures always pretty printed with 2-space indentation.
- [ ] Factory methods have no instance member defaults.
- [ ] Test fixtures match factory defaults.
- [ ] Name collisions avoided.
- [ ] All required test cases included (12 minimum).
- [ ] Partial failures and all-items-invalid tested for each required field.
- [ ] Optional (advised): live/production JSON regression test.
- [ ] Code compiles without errors.
