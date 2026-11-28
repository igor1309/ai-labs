# Splitting a call

Observer: the user, whose one recording holds two meetings back to back.

## Decided

- **A split makes two calls out of one, whole or not at all.** Each part
  has its share of the transcript and of the audio, and the original call
  is gone from the list only once both parts are there. A failed split
  before commitment leaves the original intact. After quitting, reopening shows the
  original or both completed parts.
- **Splitting needs Audelin idle,** as merging does: nothing recording,
  no transcript being finished, no notes being made.
- **The cut is at the start of the next transcript entry.** The user
  chooses a boundary with entries on both sides. Audelin orders choices by
  the time between entry starts and marks phrases that suggest a meeting
  ending or starting. The interval measures time between starts.
- **Each part reads as a call of its own:** its own entries with times
  from its own start, only the speakers who talk in it under the names
  they had, its own audio from the cut, and its own notes made from its
  transcript when that part qualifies for notes. Old notes are retired.
- **The user names both parts before confirming.** Both titles default to
  the original, including any call-app label in it. The label is part of
  the editable title. Both parts keep the original tags.
- **Part 1 keeps its start.** Part 2's audio and transcript times start at
  the exact cut. The call list shows part 2's start rounded down to the
  minute. Merging uses the exact starts.
- **Splitting is available only in the active calls folder.** Both parts
  must be eligible to merge back.
- **A split is undone by merging the two parts.** Merging joins the
  transcripts and makes notes again; the audio stays as two files, as
  after any merge. There is no separate undo.
- **Speakers are not identified again on a part.** The names already
  given stay; asking for the transcript again on a part
  (`../transcript-again/SPEC.md`) is how a user gets fresh recognition.

```gherkin
Feature: Splitting a call that was two meetings

  Background:
    Given a call is selected

  Scenario: S-1 Seeing where to cut
    When I ask to split the call
    Then I can see the boundaries ordered by time between entry starts
    And I can see the entries on each side of each boundary

  Scenario: S-2 Splitting at a chosen gap
    Given I am splitting the call
    When I choose a gap, name both parts and confirm
    Then I can see two calls in the list in place of the one
    And I can read each part's own entries, timed from its own start
    And I can see only the speakers who talk in each part
    And I can play each part's own audio
    And I can see the original tags on both parts
  Scenario: S-3 New notes for each part
    Given notes are enabled and I split a call with usable text
    When the split is done
    Then I can see each part's notes being made
    And I can read notes made from each part's transcript alone
  Scenario: S-4 A call with nothing to split
    Given the call has fewer than two transcript entries
    Then I can see that splitting is not offered for it
  Scenario: S-5 Splitting while Audelin is busy
    Given Audelin is recording, finishing a transcript or making notes
    When I ask to split the call
    Then I can see why splitting is unavailable
    And I can try again when Audelin is idle
  Scenario: S-6 Going back without splitting
    Given I am splitting the call
    When I cancel
    Then I can read the call as before
  Scenario: S-7 A split that fails
    Given I confirmed a split
    When the split cannot be completed
    Then I can read the call as before
    And I can read why the split failed
  Scenario: S-8 A split cut short by quitting
    Given I confirmed a split
    When Audelin quits before the split is done
    And I open Audelin again
    Then I can read either the call as before or both parts, never a mix
  Scenario: S-10 Checking split availability
    Given Audelin is checking the selected transcript
    Then I can see that splitting is unavailable until the check finishes
  Scenario: S-11 Failing to read split choices
    Given Audelin cannot read the selected transcript
    Then I can read why splitting is unavailable
  Scenario: S-12 A call outside the active folder
    Given the selected call is outside the active calls folder
    Then I can see why splitting is unavailable
  Scenario: S-13 Splitting is in progress
    Given Audelin is splitting or finishing publication of both parts
    Then I can see that the split is still being finished
    And I cannot submit it again
  Scenario: S-9 Undoing a split
    Given I split a call
    When I merge its two parts
    Then I can read them as one call again, with the cut marked as a gap
```
