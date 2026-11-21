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
- The call-app sources know nothing of recordings. From the moment a watch
  opens until it stops, each reports what it observes at instants on the
  same monotonic clock, and CallNames places them on the call's time and
  decides which count. Grounds: a change to call time or to the recording
  window then reaches only CallNames.
- The Zoom observer reports every poll's reading, the far-side speaker
  Zoom shows or that nobody is shown, at the poll's instant. CallNames
  ignores readings before the call's recording is on; its Zoom evidence
  begins with the first reading after that, as if Zoom had just been
  opened. Grounds: today's Zoom watch reads no window before recording.
- The browser observer reports each connection's messages at the instant
  its connection clock gives them, once that connection has a clock, and
  each connection's connect and disconnect. CallNames holds a connection's
  messages that arrive before recording is on, in order, places them when
  recording turns on (times before the start count as its start), and
  drops them if that connection disconnects first. Connects and
  disconnects change the evidence whenever they arrive, until the watch
  stops. Grounds: the extension sends its roster when it connects, before
  recording begins.
- Messages that reach CallNames while recording is off after it was on
  are held as before a start and never placed. Grounds: today's behaviour.

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

  Scenario: S-6 Zoom evidence begins once recording is on
    Given Zoom showed a far-side speaker before the call's recording began
    When recording turns on and the next poll still shows that speaker
    Then that speaker counts as speaking from that poll, not before

  Scenario: S-7 A roster sent before recording counts once recording is on
    Given a browser connection sent its roster before recording began
    When recording turns on
    Then compose can read a live name for a remote row from that roster

  Scenario: S-8 A connection that leaves before recording leaves nothing
    Given a browser connection sent its roster before recording began
    When it disconnects and then recording turns on
    Then that roster names no row
```
