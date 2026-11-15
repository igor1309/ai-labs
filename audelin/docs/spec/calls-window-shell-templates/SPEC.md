# Calls window shell — the template menu's interactions

Observer: the app's calls window, which hosts the detail view the shell
builds. Drawing is `../summary-preview-templates/SPEC.md`; deciding is
`../call-detail-templates/SPEC.md`. Oracle: `../../ARCHITECTURE.md`
§ Construction, ownership and connections.

## Decided

- **The shell maps each menu interaction to one CallDetail event** and
  holds no menu policy.

```gherkin
Feature: The template menu's interactions

  Scenario: S-1 A chosen template reaches the detail
    Given the detail view is shown
    When a template item is chosen
    Then I can observe the detail receiving that template

  Scenario: S-2 The version switch reaches the detail
    Given the detail view shows the version switch
    When Previous is chosen
    Then I can observe the detail receiving Previous

  Scenario: S-3 The keep item reaches the detail
    Given the menu is open
    When the keep item is chosen
    Then I can observe the detail receiving the toggle

  Scenario: S-4 The folder action reaches the detail
    Given the menu is open
    When the folder action is chosen
    Then I can observe the detail receiving it

  Scenario: S-6 Cancel reaches the detail
    Given notes are being made again
    When cancel is chosen
    Then I can observe the detail receiving cancel

  Scenario: S-5 The detail's state reaches the view
    Given the detail's state changes
    When the view is drawn
    Then I can see the new menu section and version
```
