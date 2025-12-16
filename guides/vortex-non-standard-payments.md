# Non-standard category payment flows

## Overview
Non-standard categories such as mobile and tax bypass the usual operator picker because their `ServiceCategory.paymentFlow` signals a dedicated UI. The `CategoryPicker`/`CategoryPickerSection` navigation switches on that flow: `.mobile` and `.taxAndStateServices` route directly into their own payment view models, `.standard` still loads operators and hands control to `PaymentProviderPicker`, while `.qr`/`.transport`/`.uin` go to their respective handlers.

## Mobile flow
- Tapping a mobile category builds a `PaymentsViewModel` configured for `.mobileConnection` through `RootViewModelFactory.makeMobilePayment()`, ties it to the current `ProcessingFlag`, and provides cancel/close callbacks so the mobile pay screen can dismiss itself and surface success state without showing intermediate operator lists.

## Tax flow
- Tax categories use `RootViewModelFactory.makeTaxPayment()`, which builds a `PaymentsViewModel` for `category: .taxes` and wraps it in `TaxPaymentsDomain` when presented from the picker section. A “Search by UIN” shortcut item is appended to the service list, so touching it triggers the dedicated tax search screen before starting a payment.

## Repeat payments for non-standard flows
- When replaying a historical payment whose `paymentFlow` isn’t `standard` or `qr`, `processPayments(lastPayment:)` extracts a `PaymentsDomain.PaymentsPayload` and sends it through `getPaymentsNavigation` to recreate the appropriate `PaymentsViewModel` directly (mobile uses `.mobileSource`, taxes use `.taxes(parameterData: nil)`, etc.).
- Each source factory pulls the stored `type`, `additionalItems`, and `mobilePhone` fields from `UtilityPaymentLastPayment` so the repeat payment launches the same non-standard screen with all fields pre-filled, keeping the routing logic centralized in the navigation helper.

## References
- `RootViewModelFactory+makeCategoryPicker.swift` / `RootViewModelFactory+makeCategoryPickerSection.swift`
- `RootViewModelFactory+makeMobilePayment.swift` / `RootViewModelFactory+makeTaxPayment.swift`
- `RootViewModelFactory+processPayments.swift` / `RootViewModelFactory+getPaymentsNavigation.swift`
