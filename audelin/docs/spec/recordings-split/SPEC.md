# Recordings split

Observer: the calls window presenting split controls.

```gherkin
Feature: Recordings split

  Scenario: S-1 Keep choices with the selected transcript
    Given choices for an earlier selection arrive after the selection changes
    When I render the current selection
    Then I can see split choices only for the currently selected transcript

  Scenario: S-2 Recheck eligibility
    Given Audelin becomes busy while the split sheet is open
    When I confirm my choices
    Then I can see why the split cannot start and keep my choices

  Scenario: S-3 Show successful replacement
    Given the split completes
    When I return to the calls list
    Then I can open part 1 from the refreshed list

  Scenario: S-4 Keep the choices after failure
    Given the confirmed split fails
    When I return to the split sheet
    Then I can read the failure and see my chosen boundary and names

  Scenario: S-5 Expose a choice read failure
    Given the selected transcript cannot be read
    When I inspect split availability
    Then I can read why splitting is unavailable
```
