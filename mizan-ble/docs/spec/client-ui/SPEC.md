# Client UI

Observer: the payer at the iPhone. The client UI draws client find's and
client connect's state, screens C1 and C2, and sends the payer's taps; it
decides nothing. Oracle: the paired flow's client side, M1 to M4 and M10,
and the user spec.

## Decided

- **Proposed, not decided by the design:** "Hold your phone closer to the
  till" and Bluetooth off in M1's no-host layout, Start disabled; on an
  iPad the iPhone layout, centred, on every client screen.

```gherkin
Feature: The payer's screens before the amount

  Scenario: S-1 No host nearby
    Given no host is in range
    When I look at the iPhone
    Then I see that no host is nearby and cannot start a handshake

  Scenario: S-2 A host in range
    Given the phone chose a host
    When I look at the iPhone
    Then I see its name and can start the handshake

  Scenario: S-3 Hold closer
    Given two hosts are too close to call
    When I look at the iPhone
    Then I am asked to hold the phone closer to the till, and cannot start a handshake

  Scenario: S-4 The host went quiet
    Given the chosen host stopped advertising
    When I look at the iPhone
    Then I see that it went quiet and nothing was sent

  Scenario: S-5 Connecting
    Given I started the handshake
    When I look at the iPhone
    Then I see that it is connecting and can cancel

  Scenario: S-6 Could not connect
    Given the handshake broke off
    When I look at the iPhone
    Then I see that I was not charged, and can try again

  Scenario: S-7 Bluetooth off
    Given Bluetooth is not available to the client
    When I look at the iPhone
    Then I see why, and cannot start a handshake
```

Not the client UI's: what a step means (client find, client connect), the
review and result screens (client payment UI), the switch (mode switch)
and the tokens and components (design system).
