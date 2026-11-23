# Composer — wiring the user's name into notes

Observer: the app, which builds the composer once and holds what it
returns. Notes templates wiring is `../composer-templates/SPEC.md`. Oracle:
`../owner-name/SPEC.md` S-4, S-5, S-7.

## Decided

- **The root decides the name:** the Zoom name from Preferences, else the
  Mac account's full name, else none. A blank value counts as none.
- **The Mac account's name is one OS call, read when a run is prepared,**
  through a binding the root owns; tests pass a fake.
- **The root marks the lines whose label is the user's side;** the
  transcript file and its format do not change.
- **The name is saved in the attempt's snapshot, which the root encodes;**
  a snapshot saved before this change reads as no name.

```gherkin
Feature: Wiring the user's name into notes

  Scenario: S-1 The Zoom name wins
    Given Zoom showed "Igor" and the Mac account is "Igor Malyarov"
    When a run is prepared
    Then I can observe SummaryJobs capturing "Igor"

  Scenario: S-2 The Mac account's name without a Zoom name
    Given Zoom never showed a name and the Mac account is "Igor Malyarov"
    When a run is prepared
    Then I can observe SummaryJobs capturing "Igor Malyarov"

  Scenario: S-3 No name at all
    Given no Zoom name and a blank Mac account name
    When a run is prepared
    Then I can observe SummaryJobs capturing no name

  Scenario: S-4 The user's lines are marked
    Given a final transcript with the user's lines and far-side lines
    When its notes are made
    Then I can observe the runtime request naming only the user's lines

  Scenario: S-5 Speaker identification reads the named lines
    Given a run with a name
    When speakers are identified
    Then I can observe the speaker request reading the same named lines

  Scenario: S-6 The transcript file is unchanged
    Given notes were made with a name
    When the call's transcript file is read
    Then I can read the user's lines under their side label

  Scenario: S-7 An attempt saved before this change
    Given a pending attempt saved without a name
    When the app starts
    Then I can observe its run resumed with no name
```
