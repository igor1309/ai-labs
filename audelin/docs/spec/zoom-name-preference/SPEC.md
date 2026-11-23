# Preferences — the user's Zoom name

Observer: the Zoom observer, which reads the remembered name when a call
starts and remembers each name Zoom shows for the user.
Oracle: `../zoom-gallery-names/SPEC.md`.

## Decided

- **Unknown until Zoom shows it.**
- **The latest name shown is kept**, across relaunches.
- **Saving another preference keeps it,** and saving it keeps the others.

```gherkin
Feature: The user's Zoom name

  Scenario: S-1 Unknown when never set
    Given no Zoom name was ever saved
    When it is read
    Then I can read it as unknown

  Scenario: S-2 A saved name is read back
    Given "Igor" was remembered
    When it is read after a relaunch
    Then I can read "Igor"

  Scenario: S-3 A newer name replaces it
    Given "Igor" was remembered
    When "Igor M" is remembered
    Then I can read "Igor M"

  Scenario: S-4 Other preferences keep it
    Given "Igor" was remembered
    When another preference is saved
    Then I can read "Igor"

  Scenario: S-5 It keeps other preferences
    Given keeping previous notes was turned off
    When a Zoom name is remembered
    Then I can read keeping as off
