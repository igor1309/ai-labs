# Summary preview UI — the template menu and versions

Observer: the user, reading the shown call. What the menu offers and when
is `../notes-menu/SPEC.md`; this spec owns how it is drawn and
which interaction it sends. Oracle: the design brief
`../../design/notes-templates.md` and `../notes-templates/SPEC.md`.

## Decided

- **The menu button trails «Копировать», which leads** (design brief).
- **A plain menu, not a split button** (owner on LAB-1615).
- **Previous / Current is a segmented switch shown only with both,** so a
  single version has no extra control (design brief).

```gherkin
Feature: Template menu and versions drawn

  Scenario: S-1 The menu button beside Copy
    Given notes are shown
    When I look at the actions
    Then I can see Copy first and the template menu button after it

  Scenario: S-2 The menu's section
    Given the menu is open
    When I read it
    Then I can read the section heading and one item per template

  Scenario: S-3 A disabled template
    Given a template is unusable
    When I open the menu
    Then I can read its reason and not choose it

  Scenario: S-10 The menu while notes are being made
    Given notes are being made
    When I open the menu
    Then I can not choose a template and can still cancel

  Scenario: S-4 The keep check item
    Given the menu offers keeping
    When I open the menu
    Then I can see a check item showing whether keeping is on

  Scenario: S-5 The folder action
    Given the menu offers the folder action
    When I choose it
    Then I can ask for the templates folder to be opened

  Scenario: S-6 The version switch
    Given the call has Previous and Current
    When I look at the notes
    Then I can switch between Previous and Current

  Scenario: S-7 No switch for one version
    Given the call has only Current
    When I look at the notes
    Then I can see no version switch

  Scenario: S-8 The template line
    Given notes are shown
    When I read the header
    Then I can read which template made them

  Scenario: S-9 Progress beside the notes
    Given notes are being made again
    When I read the call
    Then I can read the progress and the notes it has
```
