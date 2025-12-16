---
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
