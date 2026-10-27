# Host UI

Observer: the operator at the iPad. The host UI draws host broadcast's and
host payment's state and sends the operator's taps; it decides nothing.
Oracle: the paired flow's host side, M1 to M10
(`../../design/README.md`), and the user spec.

Every host screen has the mode switch in its header (`../mode-switch/`),
the session rail of five steps (amount, advertise, handshake, client
approval, process), the step pill, the large amount, and the exchange strip
with the host's step, the last message and the client's last known step.

## Decided

- **Steps are named as in the design:** H1 enter amount, H2 advertising,
  H3 handshake, H4 awaiting client, H5 processing, H6 ended.
- **The rail shows each step done, active, failed or to do** from the
  state; the operator cannot tap it.
- **Proposed, not decided by the design** (no frame draws them): Bluetooth
  off or a failure to go on air shows the reason in a failure-tinted note
  on the amount screen, Lock disabled only while Bluetooth is
  unavailable; a lost link uses the link-lost mark and "New amount", laid
  out as M6; on an
  iPhone the rail folds into the step pill.
- **"The result was sent"** on both outcomes (M8's words): the host cannot
  know the client read it.

```gherkin
Feature: The operator's screens

  Scenario: S-1 Typing an amount
    Given the host waits for an amount, with Bluetooth available
    When I type on the keypad
    Then I see the amount as I type it, and can lock it once it is above zero

  Scenario: S-2 Broadcasting
    Given I locked an amount
    When I look at the iPad
    Then I see the amount locked, the advertised name, the seconds left in a ring, and Cancel

  Scenario: S-3 Timed out
    Given no client completed a handshake in time
    When the countdown ends
    Then I see that no client came in time and the amount was cleared, and can type a new one

  Scenario: S-4 A client is connecting
    Given a client started the handshake
    When I look at the iPad
    Then I see that a client is connecting and the seconds still left

  Scenario: S-5 The handshake failed
    Given the handshake broke off
    When I look at the iPad
    Then I see that it failed and nothing was charged, and can broadcast again or take a new amount

  Scenario: S-6 Waiting for the client
    Given the amount was sent to the client
    When I look at the iPad
    Then I see that the host awaits the client's decision, with no countdown, and can cancel

  Scenario: S-7 Declined
    Given the client declined
    When I look at the iPad
    Then I see that nothing was charged, and can take a new amount

  Scenario: S-8 Picking the outcome
    Given the client confirmed
    When I look at the iPad
    Then I can pick success or failure for the mock payment

  Scenario: S-9 Paid
    Given the client confirmed
    When I pick success
    Then I see the amount paid and the result sent, and can take a new amount

  Scenario: S-10 Failed
    Given the client confirmed
    When I pick failure
    Then I see that the payment failed and the result was sent, and can take a new amount

  Scenario: S-11 The client was lost
    Given the link dropped after the amount was sent and before a result was sent
    When I look at the iPad
    Then I see that the link was lost and no result was sent, and can take a new amount

  Scenario: S-12 Bluetooth off
    Given Bluetooth is not available to the host
    When I look at the amount screen
    Then I see why, and cannot lock an amount

  Scenario: S-13 The host could not go on air
    Given the host could not go on air
    When I look at the amount screen
    Then I see why, with the amount still typed to lock again
```

Not the host UI's: what any step means (host broadcast, host payment), the
switch (mode switch), the settings sheet (settings UI) and the tokens and
components (design system).
