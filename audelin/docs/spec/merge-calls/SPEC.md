# Merging calls

Observer: the user, whose one call was saved as several because it was cut
off. Screens are owned by their specs; the merged call's notes behave as
any ended call's (`../call-summaries/SPEC.md`).
Oracle: the owner's rulings on merging calls.

## Decided

- **Only while Audelin is idle:** nothing recording, no transcript being
  finished, no notes being made (owner's ruling): no part can change, no
  work waits. A call that starts during a merge is still recorded.
- **Parts must not overlap in time;** overlapping calls were not one call.
- **Nothing is lost if Audelin quits mid-merge:** the merged call appears
  whole or not at all; only then do the parts go to the Trash whole, as a
  deleted call does. To go back, delete it and put the parts back.
- **Earliest part's start; earliest title any part has,** so the call stays
  where it began and keeps a title the user gave.
- **The parts' audio is joined end to end,** gaps left out, each part's
  sides kept in step, so the call keeps its audio and its recorded time.
- **Each gap is a transcript line** saying how long the call was cut off.
  A part whose audio cannot be read has no known end, so it is not merged.
- **Remote speakers are numbered across the whole call,** each keeping its
  name: nothing shows two parts' speakers are one.

```gherkin
Feature: Merging calls that were one call

  Scenario: S-1 Merging calls into one
    Given two or more calls are selected, each with a transcript
    When I choose to merge them and confirm
    Then one call stands in their place and I can read both transcripts in time order in it

  Scenario: S-2 I see where the call was cut off
    When I read a merged call's transcript
    Then I can read where each gap was and how long it lasted

  Scenario: S-3 The merged call keeps its audio
    When I open a merged call's folder
    Then I can play its audio, the parts one after another

  Scenario: S-4 The merged call in the list
    When I look at the calls list
    Then I can read a merged call's title, its earliest start, and the time recorded as its duration

  Scenario: S-5 Speakers are not confused across parts
    Given two merged parts each had remote speakers
    When I read the merged transcript
    Then I can tell every part's speakers apart, each with the name it had

  Scenario: S-6 Notes cover the whole call
    Given notes are on
    When I merge calls
    Then I can read notes made from the whole merged transcript

  Scenario: S-7 Going back
    Given I merged calls
    When I delete the merged call and put the parts back from the Trash
    Then I can read and use each part as before the merge

  Scenario: S-8 No merge of a call whose audio cannot be read
    When I select calls one of which has audio that cannot be read
    Then I cannot merge them and can read which one

  Scenario: S-9 No merge while a call is recording
    When I select two or more calls while a call is being recorded
    Then I cannot merge them and can read why

  Scenario: S-10 No merge while a transcript is being finished
    When I select two or more calls while a call's transcript is being finished
    Then I cannot merge them and can read why

  Scenario: S-11 No merge while notes are being made
    When I select two or more calls while notes are being made for any call
    Then I cannot merge them and can read why

  Scenario: S-12 No merge of a call without a transcript
    When I select calls one of which has no transcript
    Then I cannot merge them and can read which one lacks it

  Scenario: S-13 No merge of overlapping calls
    When I select calls that overlap in time
    Then I cannot merge them and can read why

  Scenario: S-14 Merging takes a moment
    When I have confirmed a merge that is not yet done
    Then I can see that the calls are being merged

  Scenario: S-15 A merge that fails before it is made
    When a merge fails before the merged call exists
    Then I can still read and use each call on its own and can read why it failed

  Scenario: S-16 A part that cannot be moved to the Trash
    When the merged call exists but a part cannot be moved to the Trash
    Then I can read the merged call, and which part is still listed and why

  Scenario: S-17 Audelin quits during a merge
    When I open Audelin again after it quit while merging
    Then I can read every call I had that is not in the Trash, and no half-merged call
```
