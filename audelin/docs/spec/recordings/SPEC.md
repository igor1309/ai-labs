# Recordings

Observer: compose, which builds Recordings on the machine loop and feeds
it the calls list's and the settings screen's choices, and whether a
recording runs; the calls list and the settings screen draw its state
(`../../app-shape.md`). It keeps user S-10, S-18 and S-19 (`../SPEC.md`).
Recordings decides what happens to recorded calls and the calls folder;
the calls adapter does it on disk.

## Decided

- **A machine with effects:** each action is an effect that ends in a
  result event, so the screens draw what is under way and what failed.
- **One action at a time.** A rename, delete or move asked while another
  runs is ignored; the screens show the running one.
- **A delete is asked, then confirmed.** Asking names the call; confirming
  deletes it, cancelling forgets it. Only a confirmed delete reaches the
  disk.
- **A call being recorded is never renamed, deleted or moved.** The
  running recording's call is named in the state; an action on it is
  ignored. Other calls can be renamed and deleted during a recording.
- **A move is asked with the new folder, its count and size, then
  confirmed.** Confirming moves every call, one at a time, oldest first,
  with progress in calls and bytes.
- **No move starts during a recording, and no recording starts during a
  move.** A move asked while recording is refused and the screen says why.
  While moving, Recordings reports the calls folder as not available, so
  Recording holds every start until the move ends (Recording waits on the
  calls folder condition already).
- **The setting changes only when every call has moved.** Then the new
  folder is stored and the old one is left, empty of calls. A failed move
  stops at the call that failed: the state names how many moved, that
  call and why, and the old folder stays the setting. Retrying moves the
  rest; calls moved before stay moved.
- **Results that change the list are followed by a fresh listing,** so
  the list never shows a guess.

```gherkin
Feature: Looking after recorded calls

  Scenario: S-1 Renaming a call
    Given a recorded call
    When I rename it
    Then it is renamed and the list shows the new title

  Scenario: S-2 A failed rename is named
    Given a rename that fails on disk
    When it ends
    Then I can tell which call kept its title and why

  Scenario: S-3 A delete waits for the confirm
    Given a recorded call
    When I ask to delete it
    Then nothing is deleted until I confirm, and cancelling keeps it

  Scenario: S-4 A confirmed delete removes the call
    Given a delete I asked for
    When I confirm it
    Then the call is gone from the list

  Scenario: S-5 The call being recorded is left alone
    Given a call being recorded
    When I rename, delete or move it
    Then nothing happens to it

  Scenario: S-6 One action at a time
    Given an action under way
    When I ask for another
    Then it is ignored

  Scenario: S-7 A move is asked with its size
    Given recorded calls
    When I pick another folder
    Then I am asked to move their number and size there

  Scenario: S-8 A confirmed move moves every call
    Given a move I asked for
    When I confirm it
    Then every call moves one at a time with progress, and then the new folder is the setting

  Scenario: S-9 A failed move keeps the old folder
    Given a move under way
    When a call fails to move
    Then I can tell how many moved, which failed and why, and the old folder is still the setting

  Scenario: S-10 A retried move moves the rest
    Given a failed move
    When I retry it
    Then the calls left move, and then the new folder is the setting

  Scenario: S-11 No move during a recording
    Given a call being recorded
    When I pick another folder
    Then no move starts, and I can tell why

  Scenario: S-12 No recording during a move
    Given a move under way
    When a call starts
    Then no recording begins until the move ends
```
