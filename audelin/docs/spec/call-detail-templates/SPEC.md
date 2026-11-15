# Call detail — the template menu

Observer: SummaryPreviewUI, which draws CallDetail's state and sends back
the user's actions, and the composer, which routes its intentions to
SummaryJobs. Oracle: `../notes-templates/SPEC.md` S-1 to S-4, S-8, S-10, S-12, S-13;
versions and attribution are `../call-detail-versions/SPEC.md`;
`../summary-preview/SPEC.md` and `../../ARCHITECTURE.md` § Presentation.

## Machine

The existing async CallDetail machine. `State` gains the published pair and
shown version with their template, the catalogue with reasons, the keep
choice and its save outcome, and progress or failure beside existing notes.
`Event` gains menu opened, catalogue answered, template chosen, version
chosen, keep toggled, keep answered, open folder and folder answered.
`Effect` gains read catalogue, save keep choice and open folder; a chosen
template is published as an intention (call, template, generate), never an
effect on SummaryJobs. Each scenario is one reducer test paired with one
effect test.

## Decided

- **The menu's section is "make" without notes and "make again" with them;**
  the keep item shows only with notes (design `../../design/notes-templates.md`).
- **Making again with the same template is choosing that template,** so the
  menu has one kind of item.
- **Opening the menu reads the catalogue afresh,** so a fixed file is usable.

```gherkin
Feature: Template menu

  Scenario: S-1 Make section without notes
    Given the shown call has no notes
    When the menu is opened
    Then I can draw a make section of templates and no keep item

  Scenario: S-2 Make again with notes
    Given the shown call has notes
    When the menu is opened
    Then I can draw a make-again section and the keep item with its value

  Scenario: S-3 Choosing a template
    Given the menu lists Daily
    When Daily is chosen
    Then I can observe an intention to make the call's notes with Daily

  Scenario: S-4 Choosing the shown notes' template
    Given the shown notes were made with Default
    When Default is chosen
    Then I can observe an intention to make them with Default

  Scenario: S-5 An unusable template
    Given the catalogue lists Daily as unusable
    When the menu is opened
    Then I can draw Daily disabled with its reason and the folder action

  Scenario: S-6 Default without usable files
    Given no template file is usable
    When the menu is opened
    Then I can draw Default enabled and the files' reason

  Scenario: S-10 Toggling keep
    Given keeping is on
    When the keep item is chosen
    Then I can draw keeping off once the save answers

  Scenario: S-11 A failed keep save
    Given keeping is on
    When the save fails
    Then I can draw keeping on with why

  Scenario: S-15 A repaired template on reopening
    Given Daily was unusable when the menu last opened
    When its file is fixed and the menu is opened again
    Then I can draw Daily enabled

  Scenario: S-16 The catalogue cannot be read
    Given the catalogue read fails
    When the menu is opened
    Then I can draw Default enabled and why the others are missing

  Scenario: S-17 Cancelling making notes again
    Given the shown call's notes are being made again
    When cancel is chosen
    Then I can observe an intention to cancel the call's notes

  Scenario: S-14 Opening the folder
    Given an unusable template is listed
    When the folder action is chosen
    Then I can draw whether the folder opened
```
