# Merging calls

Observer: the user, whose one call was saved as several because it was cut
off. The merged call's notes behave as any ended call's
(`../call-summaries/SPEC.md`).
Oracle: the owner's rulings on merging calls.

## Decided

- **Merging joins transcripts only.** The parts' audio is left as it was.
- **Only while Audelin is idle:** nothing recording, no transcript being
  finished, no notes being made (owner's ruling).
- **The merged call reads as the call it was:** the parts' transcripts in
  time order with each gap marked, under the earliest part's start and
  title, with one set of notes made from the whole.

```gherkin
Feature: Merging calls that were one call

  Scenario: S-1 Merging calls into one
    Given I switched the calls list to merge mode and selected calls that were one call
    When I confirm the merge
    Then I can read them as one call, see where it was cut off, and read one set of notes

  Scenario: S-2 No merge while Audelin is busy
    Given Audelin is recording or preparing a transcript or notes
    When I look for merge mode
    Then I cannot merge and can read why

  Scenario: S-3 A merge that fails
    When a merge cannot be completed
    Then I can still read each call as before and can read why it failed
```
