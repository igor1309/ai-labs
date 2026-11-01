# Client connect

Observer: the client UI, which draws this machine's state and sends the
payer's cancel and retry (screen C2). The root builds it for the host
client find handed over. It opens a secure link and reads the amount,
which the root hands to client review. The payer's cancel, or try
again after a failure, ends the transaction.

Its dependencies, each its own interface: a link (connect, write a key,
drop, and the largest write it takes), a session (derive with the host's
session, open a message, close) and a deadline.

## Decided

- **Secure means the amount opened,** so the review starts with it.
- **A handshake gets 10 s,** then fails, so a silent host cannot hold the
  payer on "Connecting…"; a nearby connect, read and write take far less.
- **A key too large for one write fails the handshake,** as `NOTES.md`
  has the client check every write before writing it. So does a link whose
  largest write is under a sealed decision (34 bytes), checked before the
  hand-over, so the payer never decides what cannot be sent.
- **A failure stays on screen until the payer tries again** (M4's "Try
  again"), so it is read before a new host replaces it.
- **Every failure closes the session and drops the link** at once, but
  only the payer's tap ends the transaction, so client find waits.

```gherkin
Feature: Opening a secure link with the chosen host

  Scenario: S-1 Connecting
    Given a host was handed over
    When the link starts connecting
    Then I can read that the client is connecting to that host, and can cancel

  Scenario: S-2 The link is secure
    Given the client is connecting
    When the session key is derived and the host's amount opens
    Then I can read that a secure link is handed over with the amount

  Scenario: S-3 The link drops during the handshake
    Given the client is connecting
    When the link drops
    Then I can read that the client could not connect, and that it can try again

  Scenario: S-4 The host's session does not agree
    Given the client is connecting
    When the session cannot derive a key from the host's session
    Then I can read that the client could not connect, and that it can try again

  Scenario: S-5 The handshake takes too long
    Given the client is connecting
    When 10 seconds pass with no secure link
    Then I can read that the client could not connect, and that it can try again

  Scenario: S-6 The key does not fit one write
    Given the client is connecting
    When the link's largest write is smaller than the key
    Then I can read that the client could not connect, and that it can try again

  Scenario: S-7 The connection cannot be set up
    Given the client is connecting
    When the link says it could not connect, with its reason
    Then I can read that the client could not connect, and that it can try again

  Scenario: S-8 The host refuses the key
    Given the client is connecting
    When the host refuses the key write
    Then I can read that the client could not connect, and that it can try again

  Scenario: S-9 The payer cancels
    Given the client is connecting
    When the payer cancels
    Then I can read that the transaction is over

  Scenario: S-10 Trying again
    Given the client could not connect
    When the payer tries again
    Then I can read that the transaction is over

  Scenario: S-11 A decision would not fit one write
    Given the session key is derived
    When the link's largest write is smaller than a sealed decision
    Then I can read that the client could not connect, and that it can try again
```

Not this machine's: choosing a host (client find, host picker), the review
(client review), bytes (codec), cryptography (session crypto) and Core
Bluetooth (client radio).
