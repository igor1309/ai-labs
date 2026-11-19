# Re-recognition offer — when a call's transcript can be made again

Observer: the user, looking at a call's row menu in the calls window.
The run itself is `../re-recognition/SPEC.md`; restoring the previous
transcript, `../previous-transcript/SPEC.md`.
Oracle: the owner's rulings on LAB-1694.

## Decided

- **The item is always in the row menu, after Переименовать,** whatever
  the call's notes: the design brief's notes items come and go with the
  notes (`../../design/calls-list.md`), so the item has its own place.
- **It needs Audelin idle,** as merging does (`../merge-calls/SPEC.md`),
  and no merge, restore or other run under way. Each of these refuses to
  start while one of the others runs, saying why, checked when it is
  asked for: each moves or rewrites a call's folder.
- **It needs all the call's audio;** missing audio names the missing
  tracks, and in a merged call the original call missing them.
- **While a call is made again, renaming, deleting and restoring it are
  refused,** each saying why: each would change the call being replaced.
  Other calls' actions run as usual, those needing Audelin idle aside.

```gherkin
Feature: When a call's transcript can be made again

  Scenario: S-1 A kept call offers it
    Given a call with all its audio and Audelin idle
    When I open the call's row menu
    Then I can ask to make its transcript again

  Scenario: S-2 One track missing
    Given a call is missing one of its tracks
    When I open the call's row menu
    Then I cannot ask to make its transcript again, and I can read which track is missing

  Scenario: S-3 All audio missing
    Given a call has no audio
    When I open the call's row menu
    Then I cannot ask to make its transcript again, and I can read that its audio is missing

  Scenario: S-4 An original call missing audio
    Given a merged call has an original call missing a track
    When I open the call's row menu
    Then I cannot ask to make its transcript again, and I can read which call and track

  Scenario: S-5 Audelin busy
    Given Audelin is not idle
    When I open a call's row menu
    Then I cannot ask to make its transcript again, and I can read why

  Scenario: S-10 Same place without notes
    Given a call without notes and one with them
    When I open each call's row menu
    Then I can find the item in the same place, after Переименовать

  Scenario: S-11 A merge under way
    Given calls are being merged
    When I open a call's row menu
    Then I cannot ask to make its transcript again, and I can read why

  Scenario: S-12 Merging during a run
    Given a call's transcript is being made again
    When I confirm a merge
    Then I cannot merge, and I can read why

  Scenario: S-6 Renaming the call being made again
    Given a call's transcript is being made again
    When I try to rename that call
    Then I cannot, and I can read why

  Scenario: S-7 Deleting the call being made again
    Given a call's transcript is being made again
    When I try to delete that call
    Then I cannot, and I can read why

  Scenario: S-8 Restoring on the call being made again
    Given a call's transcript is being made again
    When I try to restore its previous transcript
    Then I cannot, and I can read why

  Scenario: S-9 Another call is used as usual
    Given a call's transcript is being made again
    When I rename another call
    Then I can read the other call under its new name
```
