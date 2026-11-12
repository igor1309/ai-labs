# Calls list — choosing a call

Observer: the user, choosing which call to read in the calls window. What
the detail beside the list offers is `../summary-preview/SPEC.md`, the
window around both `../calls-window/SPEC.md`; renaming and deleting a call are user S-10 and S-18 (`../SPEC.md`).
Oracle: the design brief `../../design/calls-list.md`.

## Decided

- **A row's gist is the first sentence of «О чём встреча».** The summary
  opens with what the call was about, so no second field has to be kept in
  step with it.
- **The detail follows the selection, with no step to open it.** One window
  holds the list and the summary, as Mail and Notes do; the floating
  preview and its eye are gone.
- **Notes that finish while the window is open show immediately,** in the
  row and in the detail, including replacement notes from a retry: the
  user is looking at that call, and a list read on open would hide them
  until the window is closed and opened again.
- **The row menu offers «Сделать итоги» only to a call without notes,**
  as it offers «Повторить подготовку итогов» only to one whose notes
  failed: a menu lists what can be done to that call now.

```gherkin
Feature: Choosing a call to read

  Scenario: S-13 A row says what the call was about
    Given a call has notes
    When I look at the calls list
    Then I can read its title, start time, duration and what it was about

  Scenario: S-14 A row whose notes are being prepared
    Given a call's notes are being prepared
    When I look at the calls list
    Then I can see in its row that they are being prepared

  Scenario: S-15 A row whose notes failed
    Given a call's notes failed
    When I look at the calls list
    Then I can see in its row that they failed

  Scenario: S-16 A row without notes
    Given a call has no notes
    When I look at the calls list
    Then I can read its title, start time and duration

  Scenario: S-17 A click shows the call
    Given the calls window is wide
    When I click a call
    Then I can read that call beside the list

  Scenario: S-18 An arrow key shows the call
    Given the calls window is wide
    When I move the selection with an arrow key
    Then I can read the newly selected call beside the list

  Scenario: S-19 Notes that finish while I watch
    Given the selected call's notes are being prepared
    When they finish
    Then I can read them beside the list and its gist in its row

  Scenario: S-20 Retry replaces the notes I read
    Given I am reading a call's previous notes while its retry runs
    When replacement notes finish
    Then I can read the replacement without selecting the call again

  Scenario: S-27 Making notes from a row
    Given a call has no notes
    When I right-click its row and choose «Сделать итоги»
    Then I can see in its row that they are being prepared

  Scenario: S-26 An untitled call shows its folder name
    Given a call has no title of its own
    When I look at the calls list
    Then I can read its folder name in its row
```
