# Notes templates — choosing how a call's notes are written

Observer: the user, reading one call in the calls window. How the window
draws the notes is `../summary-preview/SPEC.md`; making, cancelling and
failing are `../call-notes/SPEC.md`. Notes are disposable; the transcript
is their source. Oracle: the owner's rulings on LAB-1615.

## Decided

- **Two templates ship: Default and Daily.** Default writes the notes as
  they are written today; Daily writes a handoff to read before the next
  meeting. Automatic choice of a template is out of scope.
- **Templates are files the user can edit,** one per template in a folder
  of Audelin's own. A shipped template is written only when the folder
  does not exist yet, so an edit or a deletion is never undone.
- **A template that cannot be used stays listed, disabled, with its reason**
  and a way to open the folder, so a broken edit is never silent. Its file
  is left as it is.
- **The template menu is a menu button beside «Копировать»** (not a split
  button), so making notes again is next to the notes it replaces.
- **Keeping previous notes is one choice for all calls, set in that menu,**
  not in Settings, where it is easy to miss. It is on until turned off.
- **At most two notes per call: Previous and Current.** Each new set moves
  Current to Previous; nothing older is kept. No history or comparison tools.
- **A call made before templates existed reads as made with Default.**

```gherkin
Feature: Choosing how a call's notes are written

  Scenario: S-1 The menu lists the templates
    Given a call is shown
    When I open the template menu
    Then I can choose to make its notes again, or choose any template

  Scenario: S-2 Making notes for a call without them
    Given the shown call has no notes
    When I choose a template
    Then I can see its notes being made with that template

  Scenario: S-3 Making notes again with another template
    Given the shown call has notes
    When I choose a different template
    Then I can see new notes being made with that template

  Scenario: S-4 Making notes again with the same template
    Given the shown call has notes
    When I choose to make them again
    Then I can see new notes being made with the template of the shown notes

  Scenario: S-5 Which template made the notes
    Given notes are shown
    When I read them
    Then I can read which template made them

  Scenario: S-6 Keeping the previous notes
    Given keeping previous notes is on and the shown call has notes
    When new notes are made
    Then I can switch between the previous and the current notes

  Scenario: S-7 Replacing the notes
    Given keeping previous notes is off and the shown call has notes
    When new notes are made
    Then I can read only the new notes

  Scenario: S-8 The keep choice is beside the templates
    Given a call is shown
    When I open the template menu
    Then I can turn keeping previous notes on or off for every call

  Scenario: S-9 A failure keeps the notes I had
    Given the shown call has notes
    When making new notes fails or I cancel
    Then I can still read the notes I had

  Scenario: S-10 Daily notes are a handoff
    Given a call's notes were made with Daily
    When I read them
    Then I can read what to continue, who does what, what blocks it and what was agreed

  Scenario: S-11 Daily notes do not guess
    Given a call does not say who owns an action or whether something is blocked
    When I read its Daily notes
    Then I can read that it is unclear or was not discussed

  Scenario: S-12 An edited template is used
    Given I edited a template's file
    When I choose that template
    Then I can read notes made with my edit

  Scenario: S-13 A template that cannot be used
    Given a template's file cannot be used
    When I open the template menu
    Then I can read why it cannot be used and open the templates folder
    And I cannot choose it

  Scenario: S-14 Older calls
    Given a call's notes were made before templates existed
    When I read them
    Then I can read that Default made them
```
