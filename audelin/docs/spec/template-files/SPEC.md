# Template files — the templates folder and its catalogue

Observer: the client listing templates and resolving one for notes, through
interfaces it owns (NotesMenu for the catalogue, SummaryJobs for
resolution, both wired by the composer). Oracle: `../notes-templates/SPEC.md`
S-1, S-11 to S-13, `../daily-notes/SPEC.md` and `../../ARCHITECTURE.md`
§ Generation.

## Decided

- **Shipped Default and Daily are written only when the folder is absent**
  (notes-templates Decided); an existing folder, empty included, is never
  replenished, so a deletion stays.
- **An unedited shipped file follows the shipped text:** earlier shipped instructions with the
  shipped headings are rewritten to today's, as dpkg does for an unmodified conffile; anything
  else is the user's edit and stays.
- **A bad file is an unusable entry with its reason, never rewritten,** so
  an edit is never lost or silently fixed.
- **A built-in Default always resolves,** independent of any file
  (notes-templates S-13); a chosen template that is missing or broken is
  reported, never replaced by another.
- **Each resolution reads the file afresh** (notes-templates S-11).
- **What Default and Daily ask for is their file content,** owned here only:
  Default keeps today's sections; Daily asks for `../daily-notes/SPEC.md`.

```gherkin
Feature: Templates folder and catalogue

  Scenario: S-1 First listing makes the folder
    Given the templates folder does not exist
    When the catalogue is listed
    Then I can list Default and Daily as usable

  Scenario: S-2 An existing folder is not replenished
    Given the folder exists without Daily
    When the catalogue is listed
    Then I can list no Daily file entry

  Scenario: S-13 A valid file is resolved
    Given a template file with a name, headings and instructions
    When it is resolved
    Then I can read its name, required and optional headings in order, and instructions

  Scenario: S-15 Unreadable metadata
    Given a template file whose metadata cannot be parsed
    When the catalogue is listed
    Then I can read that entry as unusable with why

  Scenario: S-16 No required headings
    Given a template file that declares no required heading
    When the catalogue is listed
    Then I can read that entry as unusable with why

  Scenario: S-17 Empty instructions
    Given a template file with no instructions
    When the catalogue is listed
    Then I can read that entry as unusable with why

  Scenario: S-4 An unusable file is left as it was
    Given a template file cannot be parsed
    When the catalogue is listed
    Then I can read the file unchanged

  Scenario: S-5 An edit is resolved
    Given a template file was edited after the last resolution
    When that template is resolved
    Then I can read the edited instructions

  Scenario: S-6 Built-in Default without usable files
    Given no template file is usable
    When Default is resolved
    Then I can read Default's instructions and headings

  Scenario: S-7 An unusable Default file stays visible
    Given the Default file cannot be parsed
    When the catalogue is listed
    Then I can read the file's reason and still choose the built-in Default

  Scenario: S-8 A missing chosen template
    Given a template was removed after it was listed
    When it is resolved
    Then I can read that it is missing, not another template

  Scenario: S-9 A folder that cannot be read
    Given the templates folder cannot be read
    When the catalogue is listed
    Then I can read why, and still choose the built-in Default

  Scenario: S-10 Opening the folder
    Given the catalogue was listed
    When the folder is opened
    Then I can read that it opened

  Scenario: S-12 A folder that cannot be opened
    Given the folder cannot be opened
    When it is opened
    Then I can read why

  Scenario: S-11 Shipped Daily asks for a handoff
    Given the shipped Daily file
    When it is resolved
    Then I can read instructions asking for each part `../daily-notes/SPEC.md` S-1 to S-5 names

  Scenario: S-18 An unedited earlier shipped file is brought up to date
    Given the Default file holds an earlier shipped Default unchanged
    When Default is resolved
    Then I can read the current shipped Default's instructions

  Scenario: S-19 An edited shipped file is kept
    Given the Default file holds an earlier shipped Default with one word changed
    When Default is resolved
    Then I can read the edited instructions
```
