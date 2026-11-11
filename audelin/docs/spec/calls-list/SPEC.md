# Calls list — notes preview

Observer: the user, choosing which call's notes to read from the calls
list. What the preview panel offers is `../summary-preview/SPEC.md`;
renaming and deleting a call are user S-10 and S-18 (`../SPEC.md`). Oracle:
the design brief `../../design/summary-preview.md` (eye A1).

## Decided

- **The eye column sits just before the row's action area.** The brief
  proposed "just before the pin"; the list has no pin, and its Open and
  Delete buttons show only on hover, so the eye goes right before them and
  stays visible on every row that has notes.
- **Notes that finish while the window is open show immediately.** Summary
  status changes reread the listed calls' notes and refresh an open preview,
  including replacement notes from an explicit retry. Showing the window
  also rereads notes that finished while it was closed.
- **Interrupted summaries offer explicit retry.** A request disables its retry
  action while in progress. A refused or failed retry displays an error and
  preserves existing notes and the transcript.
- **A closed preview stays closed** while the selection moves; only an eye
  opens it again.
- **Closing the calls window closes the preview,** which has no row to
  follow without it.

```gherkin
Feature: Choosing a call's notes to read

  Scenario: S-1 The eye marks calls with notes
    Given some calls have notes and some do not
    When I look at the calls list
    Then I can see an eye on each call with notes, just before its actions

  Scenario: S-2 Calls without notes keep the eye's place
    Given some calls have notes and some do not
    When I look at the calls list
    Then I can see every row's columns line up, with an empty place where a call has no eye

  Scenario: S-3 The eye opens the preview
    Given a call has notes
    When I press its eye
    Then I can read that call's notes in the preview

  Scenario: S-4 A click moves the preview
    Given the preview is open
    When I click another call with notes
    Then I can read that call's notes in the same preview

  Scenario: S-5 An arrow key moves the preview
    Given the preview is open
    When I move the selection with an arrow key to a call with notes
    Then I can read that call's notes in the same preview

  Scenario: S-6 A call without notes hides the preview
    Given the preview is open
    When I select a call without notes
    Then I cannot see the preview

  Scenario: S-7 The preview comes back with notes
    Given the preview is hidden on a call without notes
    When I select a call with notes
    Then I can read that call's notes in the preview

  Scenario: S-8 Notes that finish later
    Given a call without notes is selected and its notes finish
    When I open the calls window again
    Then I can see its eye and press it to read the notes

  Scenario: S-9 A closed preview stays closed
    Given I closed the preview
    When I select another call with notes
    Then I cannot see the preview until I press an eye

  Scenario: S-10 Closing the calls window
    Given the preview is open
    When I close the calls window
    Then I cannot see the preview

  Scenario: S-11 Retry completion adds an eye
    Given the calls window stays open on an interrupted call without notes
    When I retry and its notes finish
    Then I can see its eye and open the completed notes without reloading the list

  Scenario: S-12 Retry completion refreshes an open preview
    Given I am reading a call's previous notes while its retry runs
    When replacement notes finish
    Then I can read the replacement in the same preview without reopening either window

```
