# Mizan BLE

Observer: the person using Mizan BLE, as the operator of the host on an
iPad or the payer on an iPhone, both running the app in the foreground.

## Decided

- **A payment needs the payer's tap to start the handshake** (`docs/poc.md`).
- **The countdown stops once the amount is handed to the radio** (M3).
- **No timeout once the amount is on the phone** (M5).
- **The host's cancel is a sealed end message** with no receipt: if lost,
  the payer sees the link lost, or the result unknown after a confirm.
- **A link lost after a confirm leaves the payer's result unknown;** the
  host ends unprocessed. The payment is mocked, so nothing is owed.
- **The sides finish the handshake apart,** the host once it sends the
  amount, the client once it opens it: a drop between reads differently.
- **Not in v0.0.1:** telling a real till from a fake, or comparing the two
  screens; the link is encrypted, not authenticated (`NOTES.md`).

```gherkin
Feature: Paying in Mizan between an iPad and an iPhone over Bluetooth

  Background:
    Given the host is on an iPad and the client on an iPhone, both with Bluetooth on

  Scenario: S-1 A confirmed payment that succeeds
    Given the operator has locked an amount and the payer's phone is nearest
    When the payer starts the handshake, confirms, and the operator picks success
    Then both of them can see that the amount was paid

  Scenario: S-2 A confirmed payment that fails
    Given the operator has locked an amount and the payer's phone is nearest
    When the payer starts the handshake, confirms, and the operator picks failure
    Then both of them can see that the payment failed and nothing was charged

  Scenario: S-3 A declined payment
    Given the payer can see the amount the host asks for
    When the payer declines
    Then both of them can see that it was declined and nothing was charged

  Scenario: S-4 A host left alone times out
    Given the operator has locked an amount
    When no handshake completes before the countdown ends
    Then the operator can enter a new amount, and no payer can start a handshake with that host

  Scenario: S-5 The nearest host is the one paid
    Given two hosts are broadcasting and one is clearly nearer the payer
    When the payer's phone chooses a host
    Then the payer can start a handshake only with the nearer one

  Scenario: S-6 Two hosts too close to call
    Given two hosts are broadcasting with no clear nearest one
    When the payer looks at the phone
    Then the payer is asked to hold the phone closer to the till and cannot start a handshake

  Scenario: S-7 A handshake that breaks off
    Given the payer has started the handshake
    When the link drops before the host sends the amount
    Then both of them can see that the handshake failed, and the operator can broadcast again

  Scenario: S-8 The operator cancels
    Given the payer can see the amount the host asks for
    When the operator cancels
    Then the payer can see that the host cancelled and nothing was charged

  Scenario: S-9 The link drops while the payment is processed
    Given the payer has confirmed and the operator has not picked an outcome
    When the link drops
    Then the payer can see that the result is unknown, and the operator that the payer was not told

  Scenario: S-10 The amount never crosses the air in the clear
    Given a sniffer recorded the Bluetooth traffic of a payment from lock to result
    When the person reads the recording
    Then they can read neither the amount, the decision nor the result

  Scenario: S-11 One device, either role
    Given no payment is under way on a device
    When the person switches its mode
    Then the device can take part in the next payment in the other role

  Scenario: S-12 Bluetooth off
    Given Bluetooth is off on a device
    When the person opens either mode on that device
    Then they can see that Bluetooth is off, and no payment starts there

  Scenario: S-13 The countdown is the operator's to set
    Given the operator has chosen a countdown in the host's settings
    When the operator locks the next amount
    Then the operator can see the chosen countdown start, also on the first lock after a relaunch

  Scenario: S-14 Bluetooth not allowed
    Given Mizan BLE may not use Bluetooth on a device
    When the person opens either mode on that device
    Then they can see that Bluetooth is not allowed for Mizan BLE, and no payment starts there

  Scenario: S-15 A link lost with the amount on its way
    Given the host has sent the amount and the phone has not opened it
    When the link drops
    Then the payer can see the handshake failed, and the operator the link lost with nothing charged
```
