# Host radio

Observer: the root, which answers the host flows' advertiser, sender and
link with this adapter, a thin binding over `CBPeripheralManager` that
translates the GATT layout and the client's acts into events.

## Decided

- **Bluetooth state is an event;** leaving "on" also tells the client lost.
- **A failure to serve or to advertise is one event,** "could not go on
  air", with its error, as the flow answers both the same way.
- **One client per session:** the first central to subscribe and write
  Client key owns it; another's writes get an ATT error, not passed on.
- **Retire aborts:** it drops what is queued, removes the service and
  clears the owner. **Finish** sends what is queued, then retires; the
  owner unsubscribing or Bluetooth leaving "on" ends it early, so it lasts
  no longer than the link. A serve during a finish waits for its end.
- **A send is taken at once and answers only a failure:** a message over
  the owner's `maximumUpdateValueLength` fails; a full queue does not, as
  the message waits for `peripheralManagerIsReady`, in order.
- **The client is lost when the owner unsubscribes from To client:** iOS
  has no disconnect callback, and any disconnect ends it; no heartbeat.
- **A peripheral cannot disconnect a central:** the host ends a link by
  retiring the service, which the client sees as the service gone.

```gherkin
Feature: The host's side of the air

  Scenario: S-1 Bluetooth state is told
    Given the binding reports Bluetooth powered off
    When I listen to the radio
    Then I can read that Bluetooth is off

  Scenario: S-2 Serving and advertising
    Given Bluetooth is on
    When I serve a session and advertise it with a name
    Then I can read that advertising started, and a central can read that session

  Scenario: S-3 Advertising fails
    Given Bluetooth is on
    When the binding fails to start advertising
    Then I can read that the host could not go on air, with its error

  Scenario: S-4 Serving fails
    Given Bluetooth is on
    When the binding fails to add the service
    Then I can read that the host could not go on air, with its error

  Scenario: S-5 The client's key arrives
    Given a central subscribed to To client
    When it writes Client key
    Then I can read that central's key, and its write is answered

  Scenario: S-6 A second central is refused
    Given one central owns the session
    When another central writes to To host
    Then I can read nothing from it, and its write gets an error

  Scenario: S-7 A decision arrives
    Given a central owns the session
    When it writes To host
    Then I can read the bytes it wrote

  Scenario: S-8 A message to the owner only
    Given the owner and a second central both subscribed to To client
    When I send bytes
    Then I can read that they left for the owner only, and the second central got none

  Scenario: S-9 A message held for the queue
    Given the binding's queue is full
    When I send two messages and the queue drains
    Then I can read that the binding sent both to the owner, in order, and no failure

  Scenario: S-10 A message too large
    Given the owner's largest update is 20 bytes
    When I send 41 bytes
    Then I can read that the send failed, and nothing left

  Scenario: S-11 The client leaves
    Given a central owns the session
    When it unsubscribes from To client
    Then I can read that the client was lost

  Scenario: S-12 Retiring a session
    Given a central owns a served session with a message queued
    When I retire it and serve a new session
    Then I can read that the queued message never left, and a new central can own the new session

  Scenario: S-13 Finishing a session
    Given a central owns a served session with a message queued
    When I finish it
    Then I can read that the queued message left before the service was removed
  Scenario: S-14 Serving while a session finishes
    Given a session is finishing with a message queued
    When I serve a new session
    Then I can read that the queued message left before the new session went on the air
```

Not host radio's: when to advertise or what to send (host flows), bytes
(codec, session crypto).
