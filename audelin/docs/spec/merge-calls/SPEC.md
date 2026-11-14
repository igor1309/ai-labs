# Merging calls

Observer: the user, whose one call was saved as several because it was cut
off. The merged call's notes behave as any ended call's
(`../call-summaries/SPEC.md`).
Oracle: the owner's rulings on merging calls.

## Decided

- **Only while Audelin is idle:** nothing recording, no transcript being
  finished, no notes being made (owner's ruling).
- **The merged call reads as the call it was:** the parts in time order, each
  gap marked with how long the call was cut off, its audio kept, and the
  earliest part's start and title.
- **The parts go to the Trash,** as a deleted call does, so a merge can be
  undone from the Trash.

```gherkin
Feature: Merging calls that were one call

  Scenario: S-1 Merging calls into one
    Given I selected calls that were one call
    When I merge them
    Then I can read and listen to them as one call, with where it was cut off, and one set of notes

  Scenario: S-2 No merge while Audelin is busy
    Given Audelin is recording or preparing a transcript or notes
    When I select calls to merge
    Then I cannot merge them and can read why

  Scenario: S-3 A merge that fails
    When a merge cannot be completed
    Then I can still read each call as before and can read why it failed
```
