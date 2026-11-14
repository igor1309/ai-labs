# Merging calls

Observer: the user, whose one call was saved as several because it was cut
off. The merged call's notes behave as any ended call's
(`../call-summaries/SPEC.md`).
Oracle: the owner's rulings on merging calls.

## Decided

- **Merging joins transcripts only.** The parts' audio is left as it was.
- **Merging needs Audelin idle:** nothing recording, no transcript being
  finished, no notes being made (owner's ruling).
- **The merged call reads as the call it was:** the parts' transcripts in
  time order with each gap marked, under the earliest part's start and
  title, with one set of notes made from the whole.
- **A selection is far apart when another call lies between selected
  calls** in the list: the parts of one cut call are neighbours, so a call
  between them means a row was likely picked by mistake.

```gherkin
Feature: Merging calls that were one call

  Background:
    Given Audelin is idle
    And the calls list is in merge mode

  Scenario: S-1 Merging neighbouring calls
    Given calls next to each other in the list are selected
    When I confirm the merge
    Then I can read them as one call
    And I can see where the call was cut off
    And I can read one set of notes for the whole call

  Scenario: S-2 Merging calls far apart asks again
    Given calls with another call between them in the list are selected
    When I confirm the merge
    Then I am warned that a call may have been selected by mistake
    And I can merge them anyway or go back to my selection

  Scenario: S-3 A merge that fails
    Given calls are selected
    When the merge cannot be completed
    Then I can still read each call as before
    And I can read why the merge failed
```
