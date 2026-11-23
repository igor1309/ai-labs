# Message codec

Observer: the root, which turns each flow's outgoing message into bytes
for session crypto and the radio, and each incoming frame back into the
flow's event. The flows keep their scenarios only if every message reaches
the other side as it was sent, and anything else is refused as unreadable.

The codec owns two byte layouts: the Session characteristic and the
message frame. It knows no cryptography: it frames what session crypto
sealed and hands back what is to be opened.

## GATT layout

The codec's bytes travel in this layout, which both radios serve and use.

One primary service, `2B9C41A0-3990-45C8-8334-2A1760EC2EF0`, served by the
host and found by the client through a scan filtered on that UUID. The host
advertises the service UUID and its advertised name (`MIZAN-7F3A`).

| Characteristic | UUID | Properties | Host | Client |
|---|---|---|---|---|
| Session | `5AF4FD78-A9BD-4831-9E32-AB7C524B5025` | read | serves | reads |
| Client key | `3BE0A31F-A0AD-4BE6-B1F8-FCD73973F34C` | write | receives | writes |
| To client | `760B00DB-3591-4F2F-9352-D74A127CB218` | notify | sends | subscribes |
| To host | `15B7A4C5-0B45-4B5B-BAC8-08BACE8C7C1B` | write | receives | writes |

Writes are with response, so the writer learns each write arrived. The
session holds the host's compressed P-256 public key and the session id;
every message on To client and To host is a sealed message frame. The
bytes of each are the message codec's.

The order of one transaction:

1. The host locks the amount: it makes a session, serves the service and
   advertises. Its countdown starts.
2. The client's host choice offers the host; the payer starts the handshake.
   The client connects, discovers the service, subscribes to To client and
   reads Session.
3. The client writes its public key to Client key. The host stops
   advertising, keeping the service for that client. Both sides derive the
   session key; the host sends the amount on To client and stops its
   countdown once the radio has taken it.
4. The client opens the amount and shows it. The payer confirms or
   declines; the client writes the decision to To host.
5. The host opens the decision and acknowledges it on To client. On a
   decline, the transaction ends on both sides.
6. On a confirm, the host's operator picks the mock outcome; the host sends
   the result on To client. The client disconnects, and the host finishes
   the service: it sends what is queued, then removes it.

If the operator cancels before a decision counts, the host sends a sealed
end message on To client, then finishes the service. A peripheral cannot
disconnect a central, so the host ends a link by retiring the service; the
client sees it go. A transaction ends on either side when the link drops:
the client sees a disconnect or the service go, the host sees To client
unsubscribed.

## Decided

- **Session:** 1 byte version (1), the host's 33-byte compressed public
  key, the 16-byte session id: 50 bytes, read in one go.
- **Frame:** 1 byte kind, 4-byte counter (big-endian), then the sealed box
  (12-byte nonce, ciphertext, 16-byte tag). The kind and counter travel in
  the clear because session crypto binds both into the seal.
- **Kinds:** amount (1), acknowledgement (3), result (4) and end (5) to
  the client; decision (2) to the host. End has an empty body: the host
  cancelled.
- **Amount:** whole minor units (hundredths) as an unsigned 64-bit
  integer, big-endian, so 124.50 is 12450 and no decimal text is parsed.
- **Decision and result:** one byte each: confirm 1, decline 2; success 1,
  failure 2. Acknowledgement: the kind it acknowledges, one byte.
- **Anything else is unreadable:** a wrong length, an unknown kind or
  value, or a session of another version; the codec never guesses.
- **The largest frame is 41 bytes** (an amount): 1 + 4 + 12 + 8 + 16.
  Whether it fits is each sender's check against its link's limit, never
  assumed here.

```gherkin
Feature: The bytes on the air

  Scenario: S-1 A session round trip
    Given a host public key and session id
    When the session is encoded and decoded
    Then I can read the same key and session id

  Scenario: S-2 A frame round trip
    Given an amount frame, with a counter and a sealed box
    When it is framed and unframed
    Then I can read the same kind, counter and sealed box

  Scenario: S-3 An amount round trip
    Given an amount with two decimals
    When it is encoded and decoded
    Then I can read the same amount

  Scenario: S-4 A decision round trip
    Given a confirm
    When it is encoded and decoded
    Then I can read a confirm

  Scenario: S-5 A result round trip
    Given a failure
    When it is encoded and decoded
    Then I can read a failure

  Scenario: S-6 An acknowledgement round trip
    Given an acknowledgement of a decision
    When it is encoded and decoded
    Then I can read that a decision was acknowledged

  Scenario: S-7 A short frame
    Given a frame cut short
    When it is unframed
    Then I can read that it is unreadable

  Scenario: S-8 An unknown kind
    Given a frame whose kind is not one of the five
    When it is unframed
    Then I can read that it is unreadable

  Scenario: S-9 A session of another version
    Given a session whose version is not 1
    When it is decoded
    Then I can read that it is unreadable

  Scenario: S-10 A decision value out of range
    Given a decision whose byte is neither confirm nor decline
    When it is decoded
    Then I can read that it is unreadable
```

Not the codec's: sealing and opening (session crypto), whether a message is
expected now (the flows) and the radio.
