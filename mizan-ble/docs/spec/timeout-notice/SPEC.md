# Timeout notice

Observer: the host UI, which draws the timed-out screen while this
machine shows a notice. The root tells it each timeout of host broadcast
and each action of the operator on the host screen. Its one interface: a
timer it starts and stops for one notice, whose end the root delivers.

## Decided

- **A notice shows for 30 seconds,** then the host draws amount entry.
  The owner's ruling (2026-10-30); the time is fixed, not a setting.
- **Each notice belongs to one timeout,** named by host broadcast's
  attempt, whose number only grows. A timer's end hides only the notice
  it was started for, so no other timeout's wait can end it.
- **Any action on the host screen hides the notice** (a key, a button,
  the gear): the operator has seen it and moved on. Its timer is stopped.
- **A newer timeout replaces the notice** and starts its own full wait.
  The older timer is left to run out; its end changes nothing.
- **Only a newer timeout counts:** one no newer than the newest seen
  changes nothing, shown or hidden, so a notice is never restarted or
  brought back.
- **It lives as long as its host broadcast,** built and ended with it,
  since attempt numbers start again in a new one.
- **Host broadcast is not told:** its state stays timed out until the
  next lock, as before. The notice changes only what is drawn.

```gherkin
Feature: How long the host shows that it timed out

  Scenario: S-1 A timeout shows the notice
    Given no notice shows
    When host broadcast times out
    Then I can read that the notice shows for that timeout

  Scenario: S-2 The notice ends on its own
    Given a notice shows
    When 30 seconds pass
    Then I can read that no notice shows

  Scenario: S-3 The operator acts
    Given a notice shows
    When the operator acts on the host screen
    Then I can read that no notice shows

  Scenario: S-4 An action with no notice
    Given no notice shows
    When the operator acts on the host screen
    Then I can read that no notice shows

  Scenario: S-5 A newer timeout
    Given a notice shows for one timeout
    When host broadcast times out again
    Then I can read that the notice shows for the newer timeout, for 30 seconds from now

  Scenario: S-6 An older timer ends
    Given a notice shows for a newer timeout
    When the older timeout's timer ends
    Then I can read that the notice still shows for the newer timeout

  Scenario: S-7 A timer ends after an action
    Given the operator hid the notice with an action
    When that notice's timer ends
    Then I can read that no notice shows

  Scenario: S-8 The same timeout told twice
    Given a notice shows for a timeout
    When that same timeout is told again
    Then I can read that the notice shows for it, with its first wait still running

  Scenario: S-9 The same timeout after its notice ended
    Given a timeout's notice has ended
    When that same timeout is told again
    Then I can read that no notice shows

  Scenario: S-10 An older timeout
    Given a notice shows for a newer timeout
    When an older timeout is told
    Then I can read that the notice still shows for the newer timeout, with its wait still running

  Scenario: S-11 An older timeout after the notice ended
    Given a newer timeout's notice has ended
    When an older timeout is told
    Then I can read that no notice shows
```

Not this machine's: the countdown and the timeout itself (host broadcast),
the screens (host UI) and real time (the clock).
