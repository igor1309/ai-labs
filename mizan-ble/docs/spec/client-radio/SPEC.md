# Client radio

Observer: the root, which answers client find's scanner and the link and
sender of client connect, review and payment with this adapter, feeds its readings to
the host picker and maps its events into the flows'. The flows keep their
scenarios only if every advertisement brings a reading, a link to the
chosen host carries the GATT exchange, and a dropped link is told.

Client radio is a thin binding over `CBCentralManager` and `CBPeripheral`
and the translation it owns: readings from discoveries, and the steps of
the GATT exchange. It knows no message's meaning.

## Decided

- **The scan filters on the service UUID with duplicates allowed,** as
  `NOTES.md` decides: each discovery callback is one reading. It works in
  the foreground only, where v0.0.1 runs, and iOS may slow it over time,
  so the gaps between readings vary.
- **A reading is a host, its name, its RSSI and the time from the clock;**
  a host is the peripheral's identifier, stable while the app runs.
- **Connect does the whole setup:** connect, discover the service and its
  four characteristics, subscribe to To client, read Session. Any step's
  failure is "could not connect" with its reason.
- **Every write is with response** and is checked first against
  `maximumWriteValueLength(for: .withResponse)`; one that does not fit
  fails without being written. The answer, or the ATT error, is the event.
- **A link drops** on a disconnect, on the host's service going away
  (`peripheral(_:didModifyServices:)` naming it, which is how a host ends
  a link) and on Bluetooth leaving "on"; the radio then disconnects.
- **Bluetooth state is an event,** as on the host.

```gherkin
Feature: The client's side of the air

  Scenario: S-1 Bluetooth state is told
    Given the binding reports Bluetooth unauthorized
    When I listen to the radio
    Then I can read that Bluetooth is not allowed

  Scenario: S-2 Readings while scanning
    Given scanning is on
    When the binding discovers the same host three times
    Then I can read three readings for that host, each with its RSSI and time

  Scenario: S-3 Connecting to a host
    Given a host was read
    When I connect to it and every setup step succeeds
    Then I can read its session bytes and the largest write it takes

  Scenario: S-4 A setup step fails
    Given I am connecting to a host
    When the binding finds no Mizan service on it
    Then I can read that it could not connect, and why

  Scenario: S-5 Writing the key
    Given a connected host
    When I write my key
    Then I can read that the host answered the write

  Scenario: S-6 A write too large
    Given a connected host whose largest write is 20 bytes
    When I write 41 bytes
    Then I can read that the write failed, and the host got nothing

  Scenario: S-7 A message from the host
    Given a connected host
    When it notifies on To client
    Then I can read the bytes it sent

  Scenario: S-8 The link drops
    Given a connected host
    When the binding reports a disconnect
    Then I can read that the link dropped

  Scenario: S-9 The host removes its service
    Given a connected host
    When the binding reports the Mizan service invalidated
    Then I can read that the link dropped

  Scenario: S-10 Dropping the link
    Given a connected host
    When I drop the link
    Then I can read that the link dropped, and no more bytes from that host
```

Not client radio's: choosing a host (host picker), when to connect or what
to write (client flows), bytes (codec, session crypto).
