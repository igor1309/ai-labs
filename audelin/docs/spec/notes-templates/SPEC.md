# Notes templates — choosing how a call's notes are written

Observer: the user, reading one call in the calls window. How the window
draws notes is `../summary-preview/SPEC.md`; making, cancelling and failing
a call's first notes are `../call-notes/SPEC.md`; this spec owns making
them again. Notes are disposable; the transcript is their source.

## Decided

- **Default and Daily ship.** Default writes notes as today; what Daily
  writes is `../daily-notes/SPEC.md`. Automatic choice is out of scope.
- **Templates are editable files** in a folder of Audelin's own. Shipped
  ones are written only when the folder is absent, so edits and deletions
  stay; Default still works when no file is usable.
- **An unusable template stays listed, disabled, with its reason** and a way
  to open the folder, so a broken edit is never silent. Its file is untouched.
- **Making notes is a menu beside «Копировать»** whose buttons are the
  templates.
- **Keeping previous notes is one check item for all calls, in that menu,** not in Settings, where it is easy to miss. It starts on.
- **At most Previous and Current per call.** Each new set moves Current to
  Previous and drops the older Previous. No older history.
- **Notes made before templates existed read as made with Default.**

```gherkin
Feature: Choosing how a call's notes are written

  Scenario: S-1 The menu lists the templates
    Given a call is shown
    When I open the template menu
    Then I can choose to make its notes again, or choose any template

  Scenario: S-2 Notes for a call without them
    Given the shown call has no notes
    When I choose a template
    Then I can see its notes being made with that template

  Scenario: S-3 Again with another template
    Given the shown call has notes
    When I choose a different template
    Then I can see new notes being made with that template

  Scenario: S-4 Again with the same template
    Given the shown call has notes
    When I choose to make them again
    Then I can see new notes being made with the template of the shown notes

  Scenario: S-5 Which template made the notes
    Given notes are shown
    When I read them
    Then I can read which template made them

  Scenario: S-6 Keeping the previous notes
    Given keeping is on and the call has Previous and Current notes
    When new notes are made
    Then I can switch between the old Current as Previous and the new as Current

  Scenario: S-7 Replacing the notes
    Given keeping is off and the call has Previous and Current notes
    When new notes are made
    Then I can read only the new notes

  Scenario: S-8 The keep choice is beside the templates
    Given the shown call has notes
    When I open the template menu
    Then I can turn keeping previous notes on or off for every call

  Scenario: S-9 A failure keeps the notes I had
    Given the shown call has notes
    When making new notes fails
    Then I can read why and still read the notes I had

  Scenario: S-10 Cancelling keeps the notes I had
    Given new notes for a call with notes are being made
    When I cancel
    Then I can read the notes I had

  Scenario: S-11 An edited template is used
    Given I edited a template's file
    When I choose that template
    Then I can read notes made with my edit

  Scenario: S-12 A template that cannot be used
    Given a template's file cannot be used
    When I open the template menu
    Then I can read why, open the templates folder, and not choose it

  Scenario: S-13 Default without usable files
    Given no template file can be used
    When I open the template menu
    Then I can still choose Default and read why the files cannot be used

  Scenario: S-14 Older calls
    Given a call's notes were made before templates existed
    When I read them
    Then I can read that Default made them
```
