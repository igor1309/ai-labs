# Split sheet

Observer: the user splitting a recording.

```gherkin
Feature: Split sheet

  Scenario: S-1 Choose a boundary and names
    Given the split sheet is open
    When I inspect the choices and edit both names
    Then I can read the entries on either side and confirm my selection

  Scenario: S-2 Wait for the confirmed split
    Given I confirmed a split that is still running
    When I look at the sheet
    Then I can see it is working and cannot submit a second split

  Scenario: S-3 See why the split failed
    Given a confirmed split fails
    When I look at the sheet
    Then I can read the reason alongside my choices
```
