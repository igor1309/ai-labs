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
- **Audio's conditions come first:** microphone access, call audio access
  established by a muted own-process reception probe, and a calls folder
  with room; room means at least 30 GB free on the calls folder's volume (owner, 2026-10-26). No start begins without them. Once recording,
  a lost access is a failing capture and the other side goes on (the
  Session, the design's mic lost); only a lost folder or room ends it, its
  audio kept (disk full). Setup reads the conditions' merge (LAB-406).
- **Recording asks before Session begins.** Its doer awaits call-audio
  readiness for a user start, a call start and a deferred automatic start.
  The readiness port refreshes reception evidence and reserves the recording
  interval. A false answer reports call audio as unavailable and begins no
  Session. A previous missing-call-audio reading can be checked again by a
  new start. The reservation is released after Session cleanup, or when a
  pending start is stopped or refused. Compose subscribes to the published
  access condition and maps it for the menu; it does not identify start events.
- **A Session that cannot record is ended,** named until the next.
- **A side that fails while recording is named until the next recording
  begins.** The Session tells which: a lost access or a failed capture on
  the microphone side is "no microphone", on the call side "no call
  audio"; a failed track write on either side is "disk full", its audio
  so far kept. The other side goes on, and the recording runs on while any
  side records. A report for a Session that is no longer the current one
  changes nothing. The menu bar shows each fault beside its recording line
  while recording and ending.

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

  Scenario: S-15 A side failing while recording is named
    Given a recording runs
    When its Session says a side failed
    Then I can read that the recording runs and which fault it has

  Scenario: S-16 Faults are named until the next recording
    Given a recording ended with a fault named
    When a new recording begins
    Then I can read that it has no fault

  Scenario: S-17 A fault from an earlier Session changes nothing
    Given a recording runs
    When an earlier Session says a side failed
    Then I can read that the recording has no fault
```
