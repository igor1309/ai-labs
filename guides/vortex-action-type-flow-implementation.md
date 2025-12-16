# ActionTypeFlow Implementation Guide

## Overview
`ActionTypeFlow` routes action type strings (from banners, deep links, landing pages) to appropriate payment/feature flows. Unlike `CategoryPickerSection` which routes based on `ServiceCategory.paymentFlow` enum, `ActionTypeFlow` matches raw string identifiers.

## Architecture

### Domain (`ActionTypeFlowDomain.swift`)
- `Select`: Single case `.actionType(String)` - receives action type string
- `Navigation`: Enum of possible destinations (alert, qr, searchByUIN, standardPayment, templates, etc.)

### Routing (`RootViewModelFactory+makeActionTypeFlow.swift`)
- `makeActionTypeFlow(initialState:invokePhone:)` - creates the flow
- `getNavigation(select:invokePhone:notify:completion:)` - routes based on action type string
- `KnownActionType` - private enum listing recognized action types

### View (`ViewComponents+makeActionTypeFlowView.swift`)
- `makeActionTypeFlowView(_:)` - renders flow with alerts and full screen covers
- `coverView(cover:dismiss:scanQR:)` - renders specific cover views
- `FullScreenCover` enum - maps Navigation to presentable covers
- `FullScreenCover.ID` enum - provides Identifiable conformance

## Adding a New Action Type (TDD)

### Phase 1: RED - Failing Test

**Step 1.1: Write Test**
In `RootViewModelFactory+getActionTypeFlowNavigationTests.swift`:

```swift
func test_shouldDeliver<Type>_on<Type>() {

    expect(actionType: "<type-string>") { XCTAssert($0.is<Type>) }
}
```

**Step 1.2: Add DSL Helper**
In private extension:
```swift
var is<Type>: Bool {

    guard case let .<type>(value) = self else { return false }
    return value is <ExpectedDomainType>
}
```

**Step 1.3: Add KnownActionType Case**
In `RootViewModelFactory+makeActionTypeFlow.swift`:
```swift
private enum KnownActionType: String {

    case <newType>, phone, qr, templates, uin  // alphabetically sorted
}
```

**Step 1.4: Add Navigation Case**
In `ActionTypeFlowDomain.swift` (alphabetically sorted):
```swift
enum Navigation {

    case alert(Alert)
    case <newType>(<DomainType>)
    case qr(Node<QRScannerDomain.Binder>)
    // ...
}
```

**Step 1.5: Add FullScreenCover Infrastructure**
In `ViewComponents+makeActionTypeFlowView.swift`:

1. Add to `FullScreenCover` enum:
```swift
case <newType>(<ViewModelType>)
```

2. Add to `cover` computed property:
```swift
case let .<newType>(value):
    return .<newType>(value)
```

3. Add to `ID` enum:
```swift
case <newType>(ObjectIdentifier)
```

4. Add to `id` computed property:
```swift
case let .<newType>(value):
    return .<newType>(.init(value))
```

5. Add to `coverView` (with placeholder):
```swift
case let .<newType>(viewModel):
    NavigationView {
        make<NewType>View(...)
    }
```

**Step 1.6: Add Routing Placeholder**
In `RootViewModelFactory+makeActionTypeFlow.swift` `getNavigation`:
```swift
case KnownActionType.<newType>.rawValue:
    break  // placeholder - ensures we don't fall through to default
```

---

### ⛔️ STOP - VERIFY RED

Run tests. The test MUST FAIL because:
- `getNavigation` has `break` placeholder, so completion is never called
- Test times out waiting for expectation

**DO NOT PROCEED** until user confirms RED state and says "go".

---

### Phase 2: GREEN - Make Test Pass

**Step 2.1: Implement Navigation Logic**
Replace placeholder in `getNavigation`:
```swift
case KnownActionType.<newType>.rawValue:
    let viewModel = make<NewType>(...)
    completion(.<newType>(viewModel))
```

Run tests. Test should now PASS.

## Action Type Categories

### Standard Flow Types
Types that go through `initiateStandardPaymentFlow` → operator picker:
- Any unknown type falls to `default` case
- Uses cached `ServiceCategory` lookup

### Non-Standard Flow Types
Types with dedicated UIs bypassing operator picker:
- `phone` - delegates to MainViewModel (no navigation completion)
- `qr` - QR scanner via `makeQRScanner`
- `templates` - templates list via `makeTemplates`
- `uin` - UIN search via `makeSearchByUIN`
- `mobile` - calls `makeMobilePayment` so the `PaymentsViewModel` for `.mobileConnection` is presented directly

### Mapping to CategoryPickerSection Flows
| ActionTypeFlow string | CategoryPickerSection.paymentFlow |
|-----------------------|-----------------------------------|
| `"qr"` | `.qr` |
| `"uin"` | `.uin` |
| `"mobile"` | `.mobile` |
| `"taxAndStateServices"` | `.taxAndStateServices` |
| (standard categories) | `.standard` |

## scanQR Callback Pattern
When a view needs to trigger QR scanning:
```swift
scanQR: { event(.select(.actionType("qr"))) }
```
This re-enters the flow with QR action type, presenting the QR scanner.

## References
- `RootViewModelFactory+makeActionTypeFlow.swift` - routing logic
- `ActionTypeFlowDomain.swift` - domain types
- `ViewComponents+makeActionTypeFlowView.swift` - view rendering
- `RootViewModelFactory+getActionTypeFlowNavigationTests.swift` - tests
- `RootViewModelFactory+makeCategoryPickerSection.swift` - comparison with category-based routing
