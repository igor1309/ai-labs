# Client payment

Observer: the client payment UI, which draws this machine's state and
sends the payer's done (screens C4 and C5). The root builds it for the
secure link and session client review handed over with an acknowledged
confirm, and ends it when the payer is done.

Its dependencies, each its own interface: a session (open a message,
close) and a link it can drop.

## Decided

- **The payer has no exit while waiting:** M7 offers none, the host's
  operator is at the till, and the link dropping ends the wait.
- **No deadline:** the outcome is the operator's tap (M5, M7).
- **A link lost before a result** leaves the result unknown: the host had
  the confirm. Bluetooth lost reaches this machine as a dropped link.
- **A message the session refuses changes nothing,** so a replay or a
  forged result cannot end a real payment.
- **Every end closes the session and drops the link.**

```gherkin
Feature: Hearing the host's result

  Scenario: S-1 Waiting for the host
    Given an acknowledged confirm has just been handed over
    When the payer looks at the phone
    Then I can read that the host is processing the payment

  Scenario: S-2 The host reports success
    Given the client waits for the host
    When a success result arrives
    Then I can read that the amount was paid to that host

  Scenario: S-3 The host reports failure
    Given the client waits for the host
    When a failure result arrives
    Then I can read that the payment failed and nothing was charged

  Scenario: S-4 The link drops before a result
    Given the client waits for the host
    When the link drops
    Then I can read that the link was lost and the result is unknown

  Scenario: S-5 A message that does not open
    Given the client waits for the host
    When a message arrives that the session refuses
    Then I can read the state as it was

  Scenario: S-6 Done
    Given the payment has ended
    When the payer is done
    Then I can read that the transaction is over
```

Not this machine's: the decision (client review), bytes (codec),
cryptography (session crypto) and the radio.
