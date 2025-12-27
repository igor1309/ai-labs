---
date: 2025-12-03
model: Codex
description: "Flow outline for initiating payment from a selected service category."
---

## How a selected service category starts payment

1. **`initiateStandardPaymentFlow`** loads the cached `ServiceCategory` for the requested `CategoryType` on the interactive scheduler, errors if the category is missing, and forwards the category to `handleSelectedServiceCategory`, which wraps the final destination into a `StandardPaymentResult`. (See `RootViewModelFactory+initiateStandardPaymentFlow.swift` and `RootViewModelFactory+loadServiceCategory.swift`.)

2. **`handleSelectedServiceCategory`** reads cached operators for the category by paginating through `ServicePaymentOperatorStorage`. If operators are available, it creates a `PaymentProviderPicker` binder; if not, it routes to the service-category failure handler. (`RootViewModelFactory+handleSelectedServiceCategory.swift` and `RootViewModelFactory+loadCachedOperators.swift`.)

3. **`makePaymentProviderPicker`** composes the picker content (title, filters, search, provider list) and reacts to picker navigation events. User actions either show details, repeat a latest payment, exit to an outside flow, or go to `processProvider`. (`RootViewModelFactory+makePaymentProviderPicker.swift`.)

4. **`processProvider`** invokes `processSelection` with the selected provider and category type. That hooks into `UtilityPrepaymentFlowMicroServicesComposer`/`AnywayTransactionComposer`, which ultimately surface either the provider’s services picker or a direct payment flow, or navigates to error alerts on failure. (`RootViewModelFactory+makePaymentProviderPicker.swift` and `RootViewModelFactory+processSelection.swift`.)

5. **`makeNavigation`** converts a successful `AnywayTransactionState.Transaction` into an `AnywayFlow` model whose `outside` notifications drive the outer UI, finally presenting the payment destination screen. (`RootViewModelFactory+makePaymentProviderPicker.swift`.)
