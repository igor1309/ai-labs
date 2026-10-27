# Session crypto

Observer: the root, which gives each flow that holds a link its session through
the flow's own interface, one session per transaction. The flows keep
their scenarios only if the host and the client agree a key from each
other's public keys, and if a message opens only on the other side of the
same transaction, once, before it closes.

Session crypto knows no Bluetooth and no message types beyond a one-byte
kind it binds into each seal. It is CryptoKit, used as `NOTES.md` decides.

## Decided

- **Keys:** a fresh P-256 key-agreement pair on each side per session, and
  a random 16-byte session id made by the host; nothing is stored.
- **Key:** ECDH, then HKDF-SHA256 to 256 bits, salt the session id, info
  `mizan-ble v1`, so both sides derive the same key from different halves.
- **Seal:** AES-GCM with a random 12-byte nonce and a 16-byte tag. The
  authenticated data is the session id, a direction byte (0 host to
  client, 1 client to host), the kind and the counter, in that order; a
  side opens only the direction opposite its own.
- **Counters:** one per direction. The first seal is 0, each next one
  more. A receiver opens the first message at any counter and then only a
  counter above the last it opened; it advances only after a message
  authenticates. 2³²−1 is the last counter sealed; a seal after it closes
  the session instead of wrapping.
- **Closed is final:** after close nothing seals or opens. The host
  closes at the countdown's end before a secure link, and both sides at
  every end, so a message from then on is refused.
- **Public keys travel compressed** (33 bytes), which needs iOS 16; the
  app targets iOS 17. Whether a frame fits a write is the sender's check.

```gherkin
Feature: One transaction's encryption

  Scenario: S-1 Both sides derive the same key
    Given a host session and a client session
    When each derives with the other's public key and the host's session id
    Then I can read on each side what the other side sealed

  Scenario: S-2 A tampered message
    Given two sessions with a derived key
    When one byte of a sealed message changes on the way
    Then I cannot open it, and the untampered message still opens

  Scenario: S-3 A replayed message
    Given a message the receiver has already opened
    When it arrives again
    Then I cannot open it

  Scenario: S-4 A message from another transaction
    Given a message sealed in one transaction
    When it arrives in a different transaction
    Then I cannot open it

  Scenario: S-5 A message after the session closed
    Given a session that has closed
    When a message sealed before it closed arrives
    Then I cannot open it, and I cannot seal another

  Scenario: S-6 A message sent back to its sender
    Given a message sealed by the host
    When it arrives at the host
    Then I cannot open it

  Scenario: S-7 A kind that was changed
    Given a message sealed as one kind
    When it is opened as another kind
    Then I cannot open it

  Scenario: S-8 A public key that is not a key
    Given a host session
    When it derives with bytes that are not a P-256 public key
    Then I can read that no key was derived, and nothing seals

  Scenario: S-9 The same plaintext twice
    Given two sessions with a derived key
    When the same message is sealed twice
    Then I can read two different sealed messages

  Scenario: S-10 A counter that goes back
    Given a receiver that opened counter 3
    When a sealed message with counter 2 arrives
    Then I cannot open it

  Scenario: S-11 Nothing carries over
    Given two sessions made one after the other
    When each makes its keys and session id
    Then I can read different public keys and session ids

  Scenario: S-12 The last counter
    Given a session that has sealed counter 2³²−1
    When it is asked to seal another message
    Then I can read that nothing was sealed and the session is closed
```

Not session crypto's: when a session opens or closes (the flows), the bytes
around a sealed message (codec) and the radio.
