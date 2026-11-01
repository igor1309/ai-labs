# Client review

Observer: the client payment UI, which draws this machine's state and
sends the payer's confirm, decline and done (screens C3, C5). The root
builds it with what client connect handed over, and hands an
acknowledged confirm to client payment.

Its own interfaces: a session (seal, open, close), a sender that knows the
largest write and answers when the host accepted it, and a link to drop.

## Decided

- **A decision counts once the host acknowledges it.** From the tap it is
  on its way; the write's answer changes nothing visible, and only a
  refusal ends the review.
- **A decision always fits one write:** confirm and decline seal to the
  same size, and client connect checked it before the hand-over.
- **A refused write, or Bluetooth lost, is a dropped link.**
- **A link lost after a confirm was sent** leaves the result unknown: the
  host may have read it.
- **The host's end message counts until a decision is acknowledged:** the
  host cancels only while it awaits one, so nothing was charged.
- **Every end closes the session and drops the link.**

```gherkin
Feature: Reviewing the amount and deciding

  Scenario: S-1 Reviewing the amount
    Given a secure link has just been handed over
    When the payer looks at the phone
    Then I can read the host as handed over, the amount, and that the payer can confirm or decline

  Scenario: S-2 The payer declines
    Given the payer is reviewing the amount
    When the payer declines and the host acknowledges it
    Then I can read that the payer declined, the host was told, and nothing was charged

  Scenario: S-3 The payer confirms
    Given the payer is reviewing the amount
    When the payer confirms and the host acknowledges it
    Then I can read that the confirm is handed over

  Scenario: S-4 A confirm on its way
    Given the payer is reviewing the amount
    When the payer confirms and no acknowledgement has arrived
    Then I can read that the confirm is on its way and not yet acknowledged

  Scenario: S-5 A decline on its way
    Given the payer is reviewing the amount
    When the payer declines and no acknowledgement has arrived
    Then I can read that the decline is on its way and not yet acknowledged

  Scenario: S-6 The link drops during the review
    Given the payer is reviewing the amount
    When the link drops
    Then I can read that the link was lost and nothing was charged

  Scenario: S-7 The link drops after a confirm was sent
    Given the payer's confirm is not yet acknowledged
    When the link drops
    Then I can read that the link was lost and the result is unknown

  Scenario: S-8 The link drops after a decline was sent
    Given the payer's decline is not yet acknowledged
    When the link drops
    Then I can read that the link was lost and nothing was charged

  Scenario: S-9 The host cancels
    Given the payer is reviewing the amount
    When the host's end message arrives
    Then I can read that the host cancelled and nothing was charged

  Scenario: S-10 The host cancels as the payer confirms
    Given the payer's confirm is not yet acknowledged
    When the host's end message arrives
    Then I can read that the host cancelled and nothing was charged

  Scenario: S-11 The host refuses the decision
    Given the payer's confirm is not yet acknowledged
    When the host refuses the write
    Then I can read that the link was lost and nothing was charged

  Scenario: S-13 A message that does not open
    Given the payer is reviewing the amount
    When a message arrives that the session refuses
    Then I can read the state as it was

  Scenario: S-14 Done
    Given the review has ended
    When the payer is done
    Then I can read that the transaction is over

  Scenario: S-15 The host cancels as the payer declines
    Given the payer's decline is not yet acknowledged
    When the host's end message arrives
    Then I can read that the host cancelled and nothing was charged
```

Not this machine's: the handshake (client connect), the result (client
payment), bytes (codec), cryptography (session crypto) and the radio.
