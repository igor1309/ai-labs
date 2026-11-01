# Host payment

Observer: the host UI, which draws this machine's state and sends the
operator's taps (screens H4 to H6). The root builds it for one secure link
handed over by host broadcast, with the amount already sent, and ends it
when the operator asks for a new amount.

Its own interfaces: a session (open, seal, close), a sender that takes a
message for the radio and answers only a failure, and a link it can end.

## Decided

- **Each decision is acknowledged at once,** so the client can show "host
  notified" (M6); the host acts on the decision without waiting for the
  acknowledgement to leave, as the radio sends in order.
- **No timeout:** the payer reviews as long as needed (M5).
- **Sent means handed to the radio,** which sends in order and before the
  service goes; a notification has no receipt, so the host can know no
  more (M8's "result sent"). Nothing waits for a send's answer; one that
  fails is a lost link.
- **An end finishes the service:** the radio sends what is queued, then
  removes it; the session closes at once.
- **Cancel sends an authenticated end message,** then ends the link: a
  peripheral cannot disconnect a central, and the client must tell a
  cancel from a fault. Before a confirm nothing was charged.
- **Bluetooth lost arrives as a lost link.**
- **A lost link before a result ends the payment unprocessed.**
- **A message the session refuses changes nothing.**

```gherkin
Feature: Taking the client's decision and the mock outcome

  Scenario: S-1 Waiting for the client
    Given a secure link has just been handed over
    When the operator looks at the host
    Then I can read that the host awaits the client's decision, and the amount sent

  Scenario: S-2 The client declines
    Given the host awaits the client's decision
    When a decline arrives
    Then I can read that the payment was declined and the host can take a new amount

  Scenario: S-3 The client confirms
    Given the host awaits the client's decision
    When a confirm arrives
    Then I can read that the operator can pick the mock outcome

  Scenario: S-4 The operator picks success
    Given the operator can pick the mock outcome
    When the operator picks success
    Then I can read that the amount was paid and the result sent, and the host can take a new amount

  Scenario: S-5 The operator picks failure
    Given the operator can pick the mock outcome
    When the operator picks failure
    Then I can read that the payment failed and the result sent, and the host can take a new amount

  Scenario: S-6 The link drops before a decision
    Given the host awaits the client's decision
    When the client's link drops
    Then I can read that the link was lost with nothing charged, and the host can take a new amount

  Scenario: S-7 The link drops before the outcome
    Given the operator can pick the mock outcome
    When the client's link drops
    Then I can read that the link was lost and no result was sent

  Scenario: S-8 The operator cancels
    Given the host awaits the client's decision
    When the operator cancels and the end message is sent
    Then I can read that the payment ended with nothing charged, and the host can take a new amount

  Scenario: S-9 A message that does not open
    Given the host awaits the client's decision
    When a message arrives that the session refuses
    Then I can read the state as it was

  Scenario: S-10 A result that cannot be sent
    Given the operator can pick the mock outcome
    When the operator picks an outcome and sending the result fails
    Then I can read that the link was lost and no result was sent

  Scenario: S-11 A new amount
    Given the payment has ended
    When the operator asks for a new amount
    Then I can read that the payment is over and nothing more can be sent

  Scenario: S-12 A confirm's acknowledgement that cannot be sent
    Given the host awaits the client's decision
    When a confirm arrives and sending its acknowledgement fails
    Then I can read that the link was lost and no result was sent

  Scenario: S-13 A decline's acknowledgement that cannot be sent
    Given the host awaits the client's decision
    When a decline arrives and sending its acknowledgement fails
    Then I can read that the link was lost with nothing charged
```

Not this machine's: the handshake (host broadcast), the bytes of a message
(codec), cryptography (session crypto) and Core Bluetooth (host radio).
