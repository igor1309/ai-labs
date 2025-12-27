---
date: 2025-12-16
model: codex
description: "Steps for creating backend request factories in swift-vortex and wiring them into the main app."
context: Vortex project
---

## Part I - Create Request in swift-vortex module

Create request factory method in `swift-vortex/Sources/Feature/{ModuleName}/Backend` with tests in `swift-vortex/Tests/Feature/{ModuleName}/Backend`.

### For POST request with payload
Reference: `RequestFactory+createConfirmCreditCardApplicationRequest` and its tests

### For GET request with serial parameter
Reference: `RequestFactory+createGetFastPaymentsButtonListRequest` and its tests in `FastOperations/Backend`

Follow coding style from the reference files meticulously.

For tests run:
```bash
cd swift-vortex &&                                       \
xcodebuild test -quiet                                   \
  -scheme {ModuleName}                                   \
  -destination 'platform=iOS Simulator,id={SimulatorID}' \
  | xcpretty -s                                          \
&& cd ..
```

If tests fail to run - ask user, do not mess with clang or tooling.

Start by exploring reference files, then present:
- understanding of the task
- task plan

Do not change code until explicit permission.

## Part II - Create helper in main Vortex app

1. Add endpoint to `Services+Endpoint.swift`:
   - Add case to `ServiceName` enum
   - Add static endpoint property

2. Create request factory wrapper in `Vortex/Vortex/Services/Services/{Feature}/`
   - Import the module from Part I
   - Import `RemoteServices` for `RequestFactory`
   - Call `RemoteServices.RequestFactory.{method}` (extension from Part I module makes it available)

3. Create tests in `Vortex/VortexTests/Services/Services/{Feature}/`
   - Reference: `RequestFactory+createGetNotificationPromotionListRequestTests` for GET with serial
   - Use `XCTAssertNoDiff` instead of `XCTAssertEqual`
   - Use helper methods from `XCTestCase+assertRequest.swift`

Run tests:
```bash
xcodebuild test \
  -scheme Vortex-Tests \
  -destination 'platform=iOS Simulator,id={SimulatorID}' \
  -only-testing:VortexTests/{TestClassName} \
  -quiet \
  2>&1 | xcpretty -s
```

Do not add timeout parameter - timeout should not be set per-request.

## Part II Only - Empty Body GET Requests

When request has empty body and only needs serial parameter, skip Part I entirely.

1. Add endpoint to `Services+Endpoint.swift` (same as above)

2. Create request factory in `Vortex/Vortex/Services/Services/{Feature}/`:
   - Import `RemoteServices` and `VortexTools`
   - Use `RemoteServices.RequestFactory.createEmptyRequest` (NOT `Vortex.RequestFactory`)
   - Use `url.appendingSerial(serial)` from `VortexTools`

```swift
import Foundation
import RemoteServices
import VortexTools

extension RequestFactory {

    static func create{Method}Request(
        serial: String?
    ) throws -> URLRequest {

        let base = Config.serverAgentEnvironment.baseURL
        let endpoint = Services.Endpoint.{endpoint}
        let url = try endpoint.url(withBase: base).appendingSerial(serial)

        return RemoteServices.RequestFactory.createEmptyRequest(.get, with: url)
    }
}
```

**Important**: `createEmptyRequest` lives in `RemoteServices.RequestFactory`, NOT in `Vortex.RequestFactory`. Always use fully qualified name.

Reference: `RequestFactory+createGetTransferPaymentSystemListRequest.swift` in TransGran
