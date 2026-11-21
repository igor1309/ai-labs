# Call names

Observer: compose, which sends CallNames each call's recording changes, its
remote rows and the after-call pass's speaker turns, and reads back each
call's names and whether they are confirmed.

## Decided

- One machine lives as long as the app and holds every call by its id. A
  call stays held after its recording ends, since its after-call pass may
  run while the next call records, and is let go when its finalization
  ends, with or without a transcript. Grounds: the architecture's Call
  names section.
- A row is named when the call-app evidence matches it; a named row keeps
  its name, and a row still unnamed may be named on a later update.
  Grounds: ADR-002 and today's reducer.
- The after-call turns confirm the names: an empty result clears every live
  name. Missing turns or evidence leave them tentative. CallNames uses the
  evidence after the call's sources close and all their reports arrive.
  Turns reported earlier are held until then.
- Each call's watch of the call-app sources is its own: ending one call
  never stops another's. The browser adapter opens the socket for each
  call's watch and closes it when that watch stops. A recording's watch
  closes the shared socket before the next watch opens it. CallNames holds
  the next watch pending until the close is acknowledged. The next Session
  and its panel can start while the watch is pending.
- Call time comes as instants on one monotonic clock, stamped by compose on
  each recording change, the first instant recording is on starting it, as
  for Reading.

```gherkin
Feature: Naming each call's far-side rows

  Scenario: S-1 A row takes the name seen when it was said
    Given the call app showed who was speaking
    When a remote row of that call arrives
    Then compose can read that row's live name

  Scenario: S-2 Confirmed names replace live ones
    Given a call has live names
    When its after-call turns arrive
    Then compose can read the confirmed names and no live one

  Scenario: S-3 A finished call is confirmed while the next records
    Given one call has ended and the next has begun, with a row of the same id
    When the first call's after-call turns arrive
    Then compose can read the first call's confirmed names
    And the second call's names are unchanged

  Scenario: S-4 A new recording starts while the previous watch stops
    Given the previous watch has begun closing
    When the next call opens
    Then the next watch is pending while its Session and panel can start
    And acknowledging the close starts that watch

  Scenario: S-5 A finished call is let go
    Given a call's finalization has ended
    When its after-call turns arrive late
    Then compose reads nothing more for that call
```
