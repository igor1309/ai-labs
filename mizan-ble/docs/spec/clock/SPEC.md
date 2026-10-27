# Clock

Observer: the root, which answers host broadcast's countdown, client
connect's handshake deadline and the picker's ticks with this adapter. They keep
their scenarios only if time moves on its own and a countdown can be
stopped.

Clock is a thin binding over `ContinuousClock`: the current instant, and
ticks every interval asked for until stopped.

## Decided

- **Monotonic time,** not the wall clock, so a change to the device's time
  never ends a countdown early.
- **A countdown is a deadline,** not a count of ticks: each tick reads
  the seconds left from the monotonic time, so a late tick never stretches
  it, and the last tick is at zero.
- **The picker is ticked about every 0.5 s,** a chance to re-check fades
  between advertisements. Each tick and each reading carries its
  monotonic instant, so the picker reads no clock.

```gherkin
Feature: Time

  Scenario: S-1 A countdown runs out
    Given a countdown of 3 s
    When it runs
    Then I can read the seconds left going down to 0, and then nothing

  Scenario: S-2 A countdown stopped
    Given a running countdown
    When it is stopped
    Then I can read no further tick

  Scenario: S-3 Now moves on
    Given an instant read now
    When one second passes
    Then I can read an instant at least one second later
```

Not the clock's: what a tick means (the flows, the picker).
