# Calls list — merge mode

Observer: the user, merging calls in the calls window. The list draws
Recordings' merge state and sends the user's choices
(`../recordings-merge/SPEC.md`); it decides nothing. It keeps user merging
calls (`../merge-calls/SPEC.md`). Specified apart from `../calls-list/SPEC.md`
so each spec stays within 100 lines. How each state looks is the design's,
which follows this spec.

## Decided

- **Merge mode is entered and left from the window's toolbar,** and Escape
  leaves it: it changes what a click on a row does, so it is a mode the
  user can see, as in Mail's and Finder's selection modes.
- **In merge mode a click marks a row instead of reading it,** and every
  row shows whether it is marked, so a selection is never hidden.
- **Merge is a button that counts the marked calls** and is disabled below
  two, so the user can tell what will be merged before confirming.
- **Every refusal and failure reads in the window,** in the user's words.

```gherkin
Feature: Merging calls in the calls list

  Scenario: S-1 Entering merge mode
    Given Audelin is idle
    When I choose to merge calls in the toolbar
    Then I can mark rows and see the merge button

  Scenario: S-2 Merge mode is unavailable while busy
    Given Audelin is recording or preparing a transcript or notes
    When I choose to merge calls
    Then I can read why I cannot merge now

  Scenario: S-3 Marking rows
    Given merge mode
    When I click rows
    Then I can see which rows are marked and how many

  Scenario: S-4 One marked row cannot be merged
    Given merge mode with one row marked
    When I look at the merge button
    Then I can see it is disabled

  Scenario: S-5 The far-apart warning
    Given I confirmed rows with another row between them
    When the warning shows
    Then I can read that a row may be marked by mistake, and merge anyway or go back

  Scenario: S-6 A merge under way
    Given I confirmed a merge
    When it is not yet done
    Then I can see that the calls are being merged

  Scenario: S-7 A merged call is shown
    Given a merge under way
    When it is done
    Then I can see the merged call selected and read it as any selected call

  Scenario: S-8 A failed merge reads why
    Given a merge under way
    When it fails
    Then I can read why, with my rows still marked

  Scenario: S-9 Leaving merge mode
    Given merge mode with rows marked
    When I press Escape or leave merge mode in the toolbar
    Then no row is marked and a click reads a call again

  Scenario: S-10 Confirming a merge
    Given merge mode with two or more rows marked
    When I press the merge button
    Then the merge is confirmed for the marked rows
```
