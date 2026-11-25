# Splitting a call

Observer: the user, whose one recording holds two meetings back to back.
Each part's notes behave as any ended call's (`../call-summaries/SPEC.md`);
merging the parts back is `../merge-calls/SPEC.md`.

## Decided

- **A split makes two calls out of one, whole or not at all.** Each part
  has its share of the transcript and of the audio, and the original call
  is gone from the list only once both parts are there. A split that
  stops part way, by a failure or by quitting, leaves the original call
  as it was.
- **Splitting needs Audelin idle,** as merging does: nothing recording,
  no transcript being finished, no notes being made.
- **The cut lies between two transcript entries, never inside one.** The
  user picks the gap; Audelin suggests the long silences and the entries
  that sound like a meeting ending or starting, longest gap first, and
  places the cut in the middle of the chosen gap. A cut that would leave
  a part with no entries is not offered.
- **Each part reads as a call of its own:** its own entries with times
  from its own start, only the speakers who talk in it under the names
  they had, its own audio from the cut, and its own notes made from its
  transcript. The original notes are not kept, since they cover both
  meetings.
- **The user names each part before confirming.** Part 1 keeps the
  original title and start; part 2 starts at the first entry after the
  cut, rounded down to the minute, and is suggested the original title.
  Both names are editable in the split sheet.
- **Both parts keep the original's tags and the call app it came from.**
  A tag that fits only one part is removed by hand, as on any call.
  Audelin has no pinning, so there is nothing else to carry.
- **A split is undone by merging the two parts.** Merging joins the
  transcripts and makes notes again; the audio stays as two files, as
  after any merge. There is no separate undo.
- **Speakers are not identified again on a part.** The names already
  given stay; asking for the transcript again on a part
  (`../transcript-again/SPEC.md`) is how a user gets fresh recognition.

```gherkin
Feature: Splitting a call that was two meetings

  Background:
    Given Audelin is idle
    And a call is selected

  Scenario: S-1 Seeing where to cut
    When I ask to split the call
    Then I can see the gaps where it may be cut, longest first
    And I can see the entries on each side of each gap

  Scenario: S-2 Splitting at a chosen gap
    Given I am splitting the call
    When I choose a gap, name both parts and confirm
    Then I can see two calls in the list in place of the one
    And I can read each part's own entries, timed from its own start
    And I can see only the speakers who talk in each part
    And I can play each part's own audio
    And I can see the original tags on both parts

  Scenario: S-3 New notes for each part
    Given I split a call that had notes
    When the split is done
    Then I can see each part's notes being made
    And I can read notes made from each part's transcript alone

  Scenario: S-4 A call with nothing to split
    Given the call has fewer than two transcript entries
    Then I can see that splitting is not offered for it

  Scenario: S-5 Splitting while Audelin is busy
    Given Audelin is recording, finishing a transcript or making notes
    When I ask to split the call
    Then I can see that splitting waits until Audelin is idle

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

  Scenario: S-9 Undoing a split
    Given I split a call
    When I merge its two parts
    Then I can read them as one call again, with the cut marked as a gap
```

## Open

- Whether part 2's suggested title should be blank instead of a copy of
  the original. Suggested: a copy, since most splits rename one word.
