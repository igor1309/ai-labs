# Preferences — keep previous notes

Observer: NotesMenu, which shows and edits the choice, and SummaryJobs,
which reads it when a run is prepared, each through a port it owns.
Oracle: `../notes-templates/SPEC.md` S-6 to S-8 and `../../ARCHITECTURE.md`
§ Published notes and the keep choice.

## Decided

- **One choice for every call, on when never set** (notes-templates
  Decided).
- **Saving another preference keeps this one,** so Settings never resets it.
- **Turning it off removes no saved notes;** it affects later runs only.

```gherkin
Feature: Keep previous notes

  Scenario: S-1 On when never set
    Given the choice was never saved
    When it is read
    Then I can read keeping as on

  Scenario: S-2 A saved choice is read back
    Given keeping was turned off
    When it is read after a relaunch
    Then I can read keeping as off

  Scenario: S-3 A change is observed
    Given a client observes the choice
    When it is changed
    Then I can observe the new value

  Scenario: S-4 Other preferences keep it
    Given keeping was turned off
    When another preference is saved
    Then I can read keeping as off

  Scenario: S-5 A failed save is reported
    Given the settings store cannot be written
    When the choice is changed
    Then I can read why, and the value it still has
```
