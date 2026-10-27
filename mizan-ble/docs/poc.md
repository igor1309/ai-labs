# Mizan BLE

Low-energy Bluetooth proof of concept.

## v0.0.1

One app, two modes:

- **Host (iPad):** enter an amount; confirm to advertise and start a 60-second countdown; stop advertising and reset on timeout. Exchange the transaction over BLE. The client can decline or confirm; confirmation triggers mocked processing with success/failure controls, then the host displays the result.
- **Client (iPhone):** discover and connect to the host over BLE; show the amount and ask the payer to confirm or decline. Send that decision, wait for the host's mock result, and display success or failure.

The client selects a host by smoothed RSSI when there is a clear leader. Both sides establish a fresh P-256 ECDH/HKDF session key and encrypt transaction messages with AES-GCM. These are v0.0.1 decisions; see [NOTES.md](../NOTES.md). Any device can act as a fake till in this proof of concept. A later release can show a matching four-digit code on both screens; trusted host keys require a backend and are beyond the PoC.

## v0.1.0 — foreground, no manual device-selection handshake

**Feasible on iOS/iPadOS as an app-level flow.** Keep both apps visible. The iPhone scans for Mizan's service UUID, gathers foreground RSSI samples, selects a clear host using the v0.0.1 selector, and connects automatically. The apps still perform the protocol's cryptographic session setup; “no handshake” here means the payer does not manually pair, select, or confirm a device before seeing the amount. Show the amount and require an explicit payer confirmation before the host processes the mock payment. If the signal has no clear leader, ask the payer to move closer or use an explicit fallback rather than guessing.

Use **BLE GATT as the primary transport**. It directly connects the two Mizan apps and carries the session-bound encrypted messages. RSSI helps rank candidate hosts but is noisy and does not prove distance or host identity. Keep the existing per-session encryption and make the later four-digit shared confirmation the user-visible peer check; trusted host keys remain outside the proof of concept. QR or an NFC tag can be a later explicit till-identification/fallback channel, but neither is needed for the first foreground iteration.

## v0.2.0 — no app in foreground

**A reliable new payment cannot be started invisibly on iOS.** Core Bluetooth background modes can preserve or resume parts of an already configured BLE interaction, with throttled/coalesced scans and constrained advertising; they do not provide continuous discovery or a dependable app launch when a till appears. State restoration is event-driven, and a user force-quit blocks the generic restoration path. Live Activities can help surface an already-started session, not discover a new till and launch payment UI. App Intents and notifications also cannot bypass user-visible payment intent and confirmation.

For a practical “app not already open” flow, use an **explicit QR code or NFC/App Clip invocation at the till**, then show a foreground payment experience. It can identify the till and launch an App Clip or installed app; BLE can then carry the Mizan session. This is a mixed QR/NFC-invocation + BLE design, not an unattended BLE payment. On iPhone, Tap to Pay is a separate merchant acceptance route requiring Apple's entitlement and a participating PSP, and it cannot make the iPad host a card reader. Apple NFC & Secure Element/HCE programs likewise require approval and do not expose arbitrary tag/card emulation to Mizan. Real-money processing needs a PSP/bank/backend regardless of transport.

If “no app in foreground” means **backgrounding after the user has started a session**, experiment with Core Bluetooth state restoration and (on eligible versions/devices) a Live Activity, but expire and revalidate every restored transaction. Treat this as a constrained enhancement, not the v0.2.0 baseline.

## Android

Deferred by the owner for this pass. The Android research note and the cross-platform implications are intentionally not included in this synthesis; revisit before selecting shared iOS/Android behavior.

## Proposed transport by version

| Version | Recommended transport | Rationale |
|---|---|---|
| v0.0.1 | BLE GATT | Foreground iPhone-client/iPad-host prototype; supports direct discovery, selection, encrypted exchange and mocked result. |
| v0.1.0 | BLE GATT | Removes manual discovery/selection while preserving foreground scan, RSSI choice, session setup and explicit payer consent. |
| v0.2.0 | QR or NFC/App Clip invocation, then BLE GATT | The invocation supplies a user action and stable till context; BLE carries the transaction after the app is foregrounded. A background-only BLE start is not dependable on iOS. |

The findings do not call for changing v0.0.1's selected BLE roles or per-session encryption. Keep RSSI as a convenience selector only, retain the countdown and explicit amount confirmation, and treat the current mock result as a demonstration rather than evidence that funds moved. Before any real-value or offline-value claim, define payment finality, authenticated peer identity, transaction replay/idempotency, interruption recovery, relay risk, and—if offline value is intended—double-spend and rollback controls. BLE encryption alone does not solve these problems.

## Findings for the second blog post (LAB-619)

- The distinction between proximity transport and payment authorization/settlement: BLE can carry a request, but it does not make a phone a bank terminal or move money by itself.
- The iOS foreground boundary: background BLE is event-driven and constrained; no generic closed-app wake-to-pay path exists. Explicit QR/NFC/App Clip invocation is a credible user-started alternative.
- How existing patterns differ: “Вжух” uses BLE with an open app and compatible POS; QR/NFC tags commonly launch a bank app and still require confirmation; Tap to Pay is certified merchant acceptance, not phone-to-phone BLE.
- Security lessons from published offline and BLE work: RSSI is not proof of distance, encrypted pairing is not authenticated transaction intent, and offline value needs protected state, replay/double-spend controls and later reconciliation.

## Research notes

- [Apple platform constraints](research/apple.md)
- [Services and payment schemes](research/services.md)
- [Products and published designs](research/products.md)
- [Вжух architecture notes](research/vzhuh.md)
- [Project implementation decisions](../NOTES.md)
