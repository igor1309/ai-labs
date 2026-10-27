# Client payment UI

Observer: the payer at the iPhone. The client payment UI draws client
review's and client payment's state, screens C3 to C5, and sends the
payer's taps; it decides nothing. Oracle: the paired flow's client side,
M5 to M9, and the user spec.

## Decided

- **Proposed, not decided by the design:** a decision on its way as M6
  with "Sending"; "result unknown" and "the host cancelled" with the
  link-lost and declined marks.

```gherkin
Feature: The payer's screens from the amount to the result

  Scenario: S-1 Reviewing
    Given the amount arrived
    When I look at the iPhone
    Then I see who asks and the amount, and can confirm or decline

  Scenario: S-2 Declined
    Given I declined
    When the host acknowledged it
    Then I see that the host was told and I was not charged, and can finish

  Scenario: S-3 Waiting for the host
    Given I confirmed
    When the host acknowledged it
    Then I see my confirm and the host's acknowledgement, and that the host is processing

  Scenario: S-4 The host cancelled
    Given I was reviewing the amount
    When the host cancelled
    Then I see that I was not charged, and can finish

  Scenario: S-5 Paid
    Given the host reported success
    When I look at the iPhone
    Then I see the amount paid to that host, and can finish

  Scenario: S-6 Payment failed
    Given the host reported failure
    When I look at the iPhone
    Then I see that it failed and I was not charged, and can finish

  Scenario: S-7 Link lost before a result
    Given the payment ended as lost, with the result unknown
    When I look at the iPhone
    Then I see that the result is unknown, and can finish

  Scenario: S-8 Link lost with nothing charged
    Given the payment ended as lost, with nothing charged
    When I look at the iPhone
    Then I see that the link was lost and I was not charged, and can finish

  Scenario: S-9 A confirm on its way
    Given my confirm is on its way and not yet acknowledged
    When I look at the iPhone
    Then I see my confirm marked on its way, and cannot change it

  Scenario: S-10 A decline on its way
    Given my decline is on its way and not yet acknowledged
    When I look at the iPhone
    Then I see my decline marked on its way, and cannot change it

  Scenario: S-11 A confirm too large to send
    Given my confirm did not fit one write
    When I look at the iPhone
    Then I see that the payment failed and nothing was sent or charged, and can finish
```

Not the client payment UI's: what a step means (client review, client
payment), the switch (mode switch) and the tokens and components (design
system).
