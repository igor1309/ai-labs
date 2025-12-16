---
model: Claude Sonnet 4.5
---

# Backend Response Mapper Implementation Guide

## Prerequisites

Required inputs:
1. **Module Name**: Feature module (e.g., "TransGran", "ProductProfile")
2. **Method Name**: Backend method (e.g., "GetSomethingList")
3. **JSON Schema**: Expected backend response structure

Retrieve:
- **Git User**: `git config user.name` for file headers
- **Current Date**: DD.MM.YYYY format

## Path Structure

- **Production**: `Sources/Feature/{ModuleName}/Backend/{MethodName}/`
- **Tests**: `Tests/Feature/{ModuleName}/Backend/{MethodName}/`
- **Test Import**: `{ModuleName}Backend` module

## Architecture: Three-Layer Decoding

1. **DTO (Data Transfer Object)**: All properties optional, matches JSON keys exactly, implements `Decodable`
2. **Validation Layer**: Private `init(data:)` throws, validates required fields with `guard let`
3. **Public Model**: Non-optional required fields, Swift-idiomatic naming, implements `Equatable`

## Naming Conventions

### Identifiers
- **Public API**: `ID` suffix (e.g., `methodID`, `itemID`)
- **DTO**: `Id` suffix (e.g., `methodId`, `itemId`) to match JSON without CodingKeys

### Reserved Keywords
- **DTO**: Wrap in backticks regardless of type (e.g., ``default``, ``return``, ``case``)
- **Public API**: Rename appropriately
  - If Bool: use `is-` prefix (``default`` → `isDefault`)
  - If not Bool: use semantic name (``case`` → `caseType`)

### Booleans
- **Public API**: Always `is-` prefix (`isDefault`, `isActive`, `isEnabled`)
- **DTO**: Keep original JSON key with backticks if reserved keyword

### Types
- **Public Types**: Module top-level to avoid namespace pollution
- **DTOs**: File-private `DTO` and `DTO.{NestedType}` (simple names)
- **Errors**: File-private `MissingRequiredField`

### Numeric Literals
- **Swift code**: Use underscores (e.g., `10_000`, `1_000_000`)
- **JSON fixtures**: NO underscores (JSON doesn't support them)

### JSON Formatting
- **Test fixtures**: ALWAYS use pretty printed JSON with proper indentation
- Use 2 spaces for indentation
- Each object property on its own line
- Each array item on its own line for readability

### Test Formatting
- **Empty line**: ALWAYS add an empty line between test function name and test body
- Improves readability and visual separation
- **Test Fixture Arrays**: Extract repeated fixture arrays into well-named private constants
- Use descriptive names like `singleItemMissingRequiredFieldFixtures`, `secondItemMissingRequiredFieldFixtures`
- Improves readability and maintainability

## SerialStamped Pattern (Primary)

**Use when**: JSON is `{ serial: "...", {listField}: [...] }`
- Serial field always named "serial"
- List field varies: "list", "items", "countries", etc.

### File 1: Public Model
**Path**: `Sources/Feature/{ModuleName}/Backend/{MethodName}/{MethodName}.swift`

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
**Path**: `Sources/Feature/{ModuleName}/Backend/{MethodName}/ResponseMapper+map{MethodName}Response.swift`

```swift
//
//  ResponseMapper+map{MethodName}Response.swift
//  swift-vortex
//
//  Created by {GIT_USER} on {DATE}.
//

import Foundation
import RemoteServices

public extension ResponseMapper {

    typealias {MethodName} = SerialStamped<String, {ItemType}>

    static func map{MethodName}Response(
        _ data: Data,
        _ httpURLResponse: HTTPURLResponse
    ) -> MappingResult<{MethodName}> {

        map(data, httpURLResponse, mapOrThrow: {MethodName}.init(data:))
    }
}

private extension ResponseMapper.{MethodName} {

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
**Path**: `Tests/Feature/{ModuleName}/Backend/{MethodName}/ResponseMapper_map{MethodName}ResponseTests.swift`

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

    private typealias Response = ResponseMapper.{MethodName}
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

## Custom Struct Pattern

**Use when**: JSON structure is NOT `{ serial: "...", {listField}: [...] }`

```swift
// File 2: Mapper for custom struct
public extension ResponseMapper {

    struct {MethodName}: Equatable {

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

    static func map{MethodName}Response(
        _ data: Data,
        _ httpURLResponse: HTTPURLResponse
    ) -> MappingResult<{MethodName}> {

        map(data, httpURLResponse, mapOrThrow: {MethodName}.init(data:))
    }
}

private extension ResponseMapper.{MethodName} {

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

**Note**: If custom struct contains lists, use `compactMap { try? }` for list mapping.

## Critical Rules

1. **Namespace Pollution**: All public types at module top-level, NOT nested in ResponseMapper
2. **List Mapping**: Always `compactMap { try? }` to skip invalid items, never `map { try }`
3. **Factory Parameters**: NO instance method calls as defaults (Swift doesn't allow it)
4. **Name Collisions**: Use specific names (`emptyCountryList`), NOT generic (`emptyList`)
5. **Type Mapping**: JSON numbers → `Int` for counts/IDs, `Double` for money/measurements

## Required Test Coverage

1. Invalid JSON (4 cases: empty, emptyJSON, emptyDataResponse, nullServerResponse)
2. Server Error (statusCode 102)
3. Non-OK HTTP Response (199, 201, 399, 400, 401, 404)
4. Valid Data
5. Empty Lists
6. Missing Serial (if SerialStamped)
7. Missing List Field
8. Missing Optional Fields (test maps to nil)
9. Partial Failures (one test per required field - skip invalid items, keep valid ones)
10. All Items Invalid (one test per required field - return empty list)

## Validation Checklist

- [ ] Correct paths relative to package root
- [ ] Git user name in headers (`git config user.name`)
- [ ] Imports: `{ModuleName}Backend`, `RemoteServices`
- [ ] Public types at module top-level
- [ ] Public API uses `ID` suffix for identifiers
- [ ] DTOs use `Id` suffix
- [ ] DTOs and errors file-private with simple names
- [ ] Reserved keywords in backticks (DTO layer)
- [ ] Booleans use `is-` prefix (public API)
- [ ] List mappings use `compactMap { try? }`
- [ ] Swift numeric literals use underscores
- [ ] JSON fixtures NO underscores
- [ ] JSON fixtures ALWAYS pretty printed with 2-space indentation
- [ ] Factory methods no instance member defaults
- [ ] Test fixtures match factory defaults
- [ ] Name collisions avoided
- [ ] All test cases included (10 minimum)
- [ ] Partial failures and all-items-invalid tested for EACH required field
- [ ] Code compiles without errors
