# Recordings — what can start beside a transcript run

Observer: compose and the calls list, as in
`../recordings-transcript-again/SPEC.md`. It keeps
`../transcript-again-offer/SPEC.md` and restoring's availability in
`../previous-transcript/SPEC.md`. One action at a time and the idle value
hold as in `../recordings/SPEC.md` and `../recordings-merge/SPEC.md`,
except as below.

## Decided

- **Each row's offers are a pure rule over the listing, the idle value and
  what is under way,** kept in the state for each listed row, so the menu
  shows them as they are now and a request checks them again.
- **A run needs:** idle, no merge, move, restore or run under way, and
  both tracks of every original call, an unmerged call being its own one.
  A row that does not offer names why; missing audio names the call and track.
- **Restoring needs** a previous transcript, idle, and nothing under way.
- **A run locks its own call and the folders' layout, not every call:**
  while it runs, renaming or deleting that call, a merge, a move and a
  restore are refused, each naming why; renaming or deleting another call
  runs as usual. A run takes minutes; the other calls stay usable
  (`../transcript-again-offer/SPEC.md` S-9).

```gherkin
Feature: What can start beside a transcript run

  Scenario: S-1 A whole idle call offers a run
    Given Audelin is idle, nothing is under way, and a call has both tracks
    When the listing arrives
    Then I can tell that call offers a run

  Scenario: S-2 A call missing one track
    Given a call missing its call track
    When the listing arrives
    Then I can tell it does not offer a run, naming that track

  Scenario: S-3 A call missing all audio
    Given a call with no tracks
    When the listing arrives
    Then I can tell it does not offer a run, naming both tracks

  Scenario: S-4 A nested merge missing a track
    Given a merge of a merge whose innermost call misses a track
    When the listing arrives
    Then I can tell it does not offer a run, naming that call and track

  Scenario: S-5 Offers follow idleness
    Given a listed call offers a run
    When compose says Audelin is not idle
    Then I can tell it no longer offers one, and why

  Scenario: S-6 A request is checked again
    Given the menu showed a run offered, and Audelin is now not idle
    When I ask for the run
    Then nothing is asked of the run port, and I can read why

  Scenario: S-7 A run waits for a merge
    Given a merge under way
    When I ask for a run
    Then nothing is asked of the run port, and I can read why

  Scenario: S-8 A run's own call cannot be renamed
    Given a run under way
    When I ask to rename that call
    Then nothing is asked of any port, and I can read why

  Scenario: S-9 Another call stays usable
    Given a run under way
    When I rename another call
    Then the rename port is asked for that call

  Scenario: S-10 The layout is locked during a run
    Given a run under way
    When I ask to merge, move or restore
    Then nothing is asked of any port, and I can read why

  Scenario: S-11 Restore is offered only when it can start
    Given a call with a previous transcript
    When Audelin is idle and nothing is under way
    Then I can tell it offers a restore

  Scenario: S-12 A run's own call cannot be deleted
    Given a run under way
    When I ask to delete that call
    Then nothing is asked of any port, and I can read why
```
