# Recording

Observer: compose, which builds Recording on the machine loop, feeds it
events through the merge mapping, begins and ends a Session for it, and
hands its state to the panel and the menu bar (`../../app-shape.md`). They
show whether a call is recorded, why, and what held it back: user S-1, S-2, S-7, S-17 (`../SPEC.md`). Recording decides
whether a recording runs; its Session brings the pieces up and down.

## Decided

- **A recording begins on a call or by hand.** A call starting begins one
  when automatic recording is on (S-1); the user begins one when none runs
  (S-2). A second call app joins the running call (Core Audio processes).
- **It ends with its call or by hand,** however it began (S-7, S-17), and
  also while still beginning. The user ending one during a call holds until
  that call ends, so automatic recording does not begin it again at once.
- **One at a time.** A start while a recording begins or runs is ignored.
  A call that starts while the last Session ends is recorded once it has
  ended, if the call is still on.
- **Idle only once the Session has ended,** so recordings never overlap.
- **Audio's conditions come first:** microphone and call audio access,
  a calls folder with room; room means at least 30 GB free on the calls
  folder's volume (owner, 2026-10-26). No start begins without them. Once recording,
  a lost access is a failing capture and the other side goes on (the
  Session, the design's mic lost); only a lost folder or room ends it, its
  audio kept (disk full). Setup reads the conditions' merge (LAB-406).
- **A Session that cannot record is ended,** named until the next (LAB-510).

```gherkin
Feature: Deciding when a call is recorded

  Scenario: S-1 A call begins a recording
    Given automatic recording is on and nothing is missing
    When a call starts
    Then I can read that a recording begun by the call runs

  Scenario: S-2 A call begins nothing when automatic recording is off
    Given automatic recording is off
    When a call starts
    Then I can read that no recording runs

  Scenario: S-3 The user begins a recording
    Given no call is on and nothing is missing
    When the user starts recording
    Then I can read that a recording begun by hand runs

  Scenario: S-4 The user ends a recording
    Given a recording begun by hand runs with no call on
    When the user stops it and its Session ends
    Then I can read that no recording runs

  Scenario: S-5 A call's end ends its recording, however it began
    Given a recording runs during a call
    When the call ends and its Session ends
    Then I can read that no recording runs

  Scenario: S-6 A call the user stopped is not recorded again
    Given the user stopped the recording of a call that is still on
    When the call goes on
    Then I can read that no recording runs until a new call starts

  Scenario: S-7 A start while a recording is on changes nothing
    Given a recording is on
    When a start comes
    Then I can read that the same recording is on

  Scenario: S-8 A call during bring-down is recorded after it
    Given a recording is ending
    When a call starts and the Session ends
    Then I can read that a recording begun by the call runs

  Scenario: S-9 A missing condition holds a start back
    Given a needed condition is missing
    When a start comes
    Then I can read that no recording runs and what is missing

  Scenario: S-10 A Session that cannot record is ended and named
    Given a recording is on
    When its Session says it cannot record and then ends
    Then I can read that no recording runs and why

  Scenario: S-11 A stop while a recording begins ends it
    Given a recording is beginning
    When a stop comes and its Session ends
    Then I can read that no recording runs

  Scenario: S-12 A call that ends during bring-down is not recorded
    Given a call started while a recording was ending
    When the call ends and then the Session ends
    Then I can read that no recording runs

  Scenario: S-13 Losing the calls folder ends a recording
    Given a recording runs
    When the calls folder goes missing and the Session ends
    Then I can read that no recording runs and what is missing

  Scenario: S-14 A condition coming back allows a start
    Given a needed condition was missing
    When it comes back and a start comes
    Then I can read that a recording runs
```
