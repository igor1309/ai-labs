# Host broadcast

Observer: the host UI, which draws this machine's state and sends the
operator's lock, cancel and retry (screens H1 to H3). It takes a locked
amount to a secure link with one client, which the root hands to host
payment while this machine waits in its handed-over state.

Its dependencies, each its own interface: a session (open, derive, seal,
close), an advertiser (serve a session, advertise, stop advertising,
retire the service), a sender, a countdown and the countdown setting.

## Decided

- **The countdown is read at each lock,** so a change in settings applies
  to the next amount, never the one on air.
- **The countdown is the handshake's deadline:** it runs until the link is
  secure, as the design stops it "once the link is up" (M3); at zero the
  session closes, so nothing from it opens later.
- **The first client key stops advertising** but keeps the service for
  that client; any other client's writes are refused by the radio.
- **Secure means the amount was sent;** host payment awaits a decision.
- **Broadcast again opens a new session** with the same amount and a full
  countdown, so nothing from the failed handshake opens in the new one.
- **Every end but the hand-over closes the session and retires the
  service;** Bluetooth lost reaches the handshake as a dropped link.
- **No cancel during the handshake:** it takes a second or two, the
  countdown bounds it, and Cancel returns once the amount is sent.

```gherkin
Feature: Broadcasting a locked amount until a client holds a secure link

  Scenario: S-1 Locking starts the broadcast
    Given an amount above zero from amount entry
    When the operator locks it
    Then I can read that it is advertised, with the seconds left from the countdown setting

  Scenario: S-2 The host cannot go on air
    Given the operator locked an amount
    When the advertiser says it could not go on air, with its reason
    Then I can read that reason, and the amount typed but not locked

  Scenario: S-3 The countdown ends with no secure link
    Given the amount is advertised and no handshake has completed
    When the countdown ends
    Then I can read that it timed out, that advertising stopped, and an empty amount to type

  Scenario: S-4 Cancel while advertising
    Given the amount is advertised and no client has sent its key
    When the operator cancels
    Then I can read that advertising stopped and the amount is typed but not locked

  Scenario: S-5 A client starts the handshake
    Given the amount is advertised
    When a client sends its key
    Then I can read that the handshake is under way and the seconds still left

  Scenario: S-6 The link is secure
    Given a client's key has arrived
    When the session key is derived and the amount is sent
    Then I can read that a secure link is handed over, with no countdown

  Scenario: S-7 The client's key does not agree
    Given the handshake is under way
    When the session cannot derive a key from the client's key
    Then I can read that the handshake failed, and that the host can broadcast again or take a new amount

  Scenario: S-8 The link drops during the handshake
    Given the handshake is under way
    When the client's link drops
    Then I can read that the handshake failed, and that the host can broadcast again or take a new amount

  Scenario: S-9 The amount cannot be sent
    Given the session key is derived
    When sending the amount fails
    Then I can read that the handshake failed, and that the host can broadcast again or take a new amount

  Scenario: S-10 Broadcast again
    Given the handshake failed
    When the operator broadcasts again
    Then I can read that the same amount is advertised with the full countdown

  Scenario: S-11 A new amount after a failed handshake
    Given the handshake failed
    When the operator asks for a new amount
    Then I can read an empty amount to type

  Scenario: S-12 Back after a payment
    Given a secure link was handed over
    When host payment's end reaches this machine
    Then I can read an empty amount to type

  Scenario: S-13 Bluetooth is lost while on air
    Given the amount is advertised
    When the advertiser says Bluetooth is not available, with its reason
    Then I can read that reason, and the amount typed but not locked
```

Not this machine's: typing the amount (amount entry), what happens after
the hand-over (host payment), bytes (codec), cryptography (session crypto)
and Core Bluetooth (host radio).
