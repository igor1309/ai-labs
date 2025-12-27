---
date: 2025-12-03
model: Codex
description: "Flow outline for phone-based payment initiation via contacts picker."
---

## Phone payment initiation via contacts picker

1. **Phone input + contact action** – `PaymentsInputPhoneView.ViewModel` backs the phone parameter field that the SFP flow shows. Its action button instantiates `model.makeContactsViewModel(forMode: .select(.contacts))`, binds the resulting `ContactsViewModel`, and posts a `PaymentsParameterViewModelAction.InputPhone.ContactSelector.Show`. Contacts selection updates the text field, refreshes `source.parameter.value`, and fires `ModelAction.LatestPayments.BanksList.Request` so the downstream bank picker already knows favorite banks. (`PaymentsInputPhoneViewComponent.swift`.)

2. **Contacts view model (select mode)** – `Model.makeContactsViewModel` builds the picker with a search field, the `.select(.contacts)` sections, and helpers (`makeRequest`, `bankFromID`, `countryForBank`). In this mode only the contacts list renders, and typing still drives the same `makeRequest` closure for client/bank lookup so the stream of `ModelAction.BankClient.Request` and `ModelAction.LatestPayments.BanksList.Request` runs exactly as it would during fast payments. (`ContactsViewModel.swift`, `Model.makeContactsViewModel(forMode:)`.)

3. **Selection actions** – When a contact row is tapped, `ContactsViewModelAction.ContactPhoneSelected` is sent; the binder updates the phone input and triggers `LatestPayments.BanksList`. If the row carries a `Payments.Operation.Source` (latest payment, `.sfp`, `.direct`, etc.) the table fires `ContactsViewModelAction.PaymentRequested`. This payload becomes the actual source for the payment operation. (`ContactsViewModel.swift`, `ContactsSectionViewModelAction`, `ContactsViewModelAction`.)

4. **Routing to payment flow** – `PaymentsTransfersViewModel` listens for `PaymentRequested` and immediately dismisses the picker modal before creating a `PaymentsViewModel(source: payload.source, …)`. That view model runs the normal/walkthrough SFP operation (the same `Model.paymentsStepSFP` / `Payments.Operation` pipeline referenced earlier). Once the payment view finishes, contact/success callbacks (e.g., `.sfp` or `.mock`) send `PaymentsTransfersViewModelAction.Show.Contacts()` so the user returns to the contacts picker if another payment is needed. (`PaymentsTransfersViewModel.swift`, `requestContactsPayment`, `bind(_: ContactsViewModel)`.)

5. **Loop back & bank lookup** – Because the contacts view always uses the `makeRequest` helper, re-opening the picker or switching to `.fastPayments(.banksAndCountries)` mode reuses `ModelAction.BankClient.Request` and `LatestPayments.BanksList.Request`. That keeps the bank list in sync with the selected phone and lets `PaymentsViewModel` prefill bank/product/amount parameters before showing the payment screen. (`ContactsViewModel.swift` search binding and `makeRequest` closure.)
