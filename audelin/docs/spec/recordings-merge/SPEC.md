# Recordings — merging calls

Observer: compose, which builds Recordings and feeds it the calls list's
merge choices; the calls list draws its state (`../calls-list-merge/SPEC.md`).
It keeps user merging calls (`../merge-calls/SPEC.md`). Merging is part of
Recordings, specified here so each spec stays within 100 lines; one action at
a time and fresh listings after results hold as in `../recordings/SPEC.md`.

## Decided

- **Idleness is a query the reducer is given,** asked when merge mode is
  entered and when a merge is confirmed. Recordings never learns why
  Audelin is busy, only that it is; compose answers the query.
- **Merge mode is a phase, like asking to delete.** No rename, delete or
  move starts in it, and a merge does not start during another action.
- **A selection needs two or more calls.** Confirming fewer does nothing.
- **Far apart is a pure rule over the whole list,** not the rows a search
  shows: selected calls are far apart when an unselected call lies between
  two of them in list order.
- **Confirming far-apart calls asks again before the effect,** as a delete
  is asked before it is confirmed. Going back keeps the selection.
- **The outcome names the merged call or why it failed.** A merged call is
  selected and merge mode ends; a failure keeps merge mode and the
  selection, and names the reason.

```gherkin
Feature: Merging calls

  Scenario: S-1 Merge mode opens while idle
    Given Audelin is idle and no action is under way
    When I enter merge mode
    Then I can select calls to merge

  Scenario: S-2 Merge mode is refused while busy
    Given Audelin is not idle
    When I enter merge mode
    Then merge mode stays closed and I can tell that Audelin is busy

  Scenario: S-3 Selecting calls
    Given merge mode is open
    When I select and unselect calls
    Then I can tell which calls are selected

  Scenario: S-4 Fewer than two calls do not merge
    Given merge mode with one call selected
    When I confirm the merge
    Then nothing is asked of the merge port

  Scenario: S-5 Neighbouring calls merge
    Given merge mode with neighbouring calls selected and Audelin idle
    When I confirm the merge
    Then the merge port is asked to merge those calls and I can tell a merge is under way

  Scenario: S-6 Far-apart calls ask again
    Given merge mode with an unselected call between selected calls
    When I confirm the merge
    Then I am warned before the merge port is asked

  Scenario: S-7 Merging anyway after the warning
    Given I was warned that the selected calls are far apart
    When I merge them anyway
    Then the merge port is asked to merge those calls

  Scenario: S-8 Going back after the warning
    Given I was warned that the selected calls are far apart
    When I go back
    Then merge mode is open with the same calls selected

  Scenario: S-9 Confirming while busy is refused
    Given merge mode with calls selected and Audelin no longer idle
    When I confirm the merge
    Then nothing is asked of the merge port and I can tell that Audelin is busy

  Scenario: S-10 A merged call is selected
    Given a merge under way
    When the merge port reports the merged call
    Then merge mode has ended and the merged call is selected in a fresh listing

  Scenario: S-11 A failed merge is named
    Given a merge under way
    When the merge port reports why it failed
    Then merge mode is open with the same selection and I can read why

  Scenario: S-12 Leaving merge mode
    Given merge mode with calls selected
    When I leave merge mode
    Then no call is selected for merging and other actions can start
```
