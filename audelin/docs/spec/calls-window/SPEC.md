# Calls window — the list and the call beside it

Observer: the user, working in the calls window. Each row and what the
selection shows is `../calls-list/SPEC.md`; the call beside the list is
`../summary-preview/SPEC.md`; renaming and deleting a call are user S-10
and S-18 (`../SPEC.md`), their failures `../calls/SPEC.md`.
Oracle: the design brief `../../design/calls-list.md`.

## Decided

- **Below 700 pt the call beside the list hides** and Return or Space
  opens it in its own window: the list keeps 340 pt and the call needs
  about 360 to read.
- **Open shows the call's folder in Finder,** in a wide window as in a
  narrow one by the row menu; Return and a double-click are its shortcuts
  while the call is already readable beside the list.

```gherkin
Feature: Working in the calls window

  Scenario: S-1 A narrow window shows the list alone
    Given the calls window is too narrow for the list and the call
    When I look at it
    Then I can see only the list

  Scenario: S-2 Return opens the call in a narrow window
    Given the calls window is narrow
    When I press Return on a call
    Then I can read that call in its own window

  Scenario: S-3 Space opens the call in a narrow window
    Given the calls window is narrow
    When I press Space on a call
    Then I can read that call in its own window

  Scenario: S-4 Widening shows the call again
    Given the calls window is narrow
    When I make it wide enough for the list and the call
    Then I can read the selected call beside the list

  Scenario: S-5 The divider holds across restarts
    Given I moved the divider between the list and the call
    When I restart Audelin and open the calls window
    Then I find the divider where I left it

  Scenario: S-6 Return in a wide window opens the folder
    Given the calls window is wide
    When I press Return on a call
    Then I can see that call's folder in Finder

  Scenario: S-7 A double-click opens the folder
    Given the calls window shows a call
    When I double-click its row
    Then I can see that call's folder in Finder

  Scenario: S-8 Tab moves between the list and the call
    Given the calls window is wide and the list has focus
    When I press Tab
    Then I can select and copy text in the call, and Tab again returns to the list

  Scenario: S-9 An inactive window keeps its selection
    Given a call is selected
    When another window becomes active
    Then I can still see which call is selected, in the inactive style

  Scenario: S-10 No calls yet
    Given the calls folder holds no calls
    When I open the calls window
    Then I can read that there are no calls yet

  Scenario: S-11 Calls still being read
    Given the calls folder is still being read
    When I open the calls window
    Then I can see that the calls are loading

  Scenario: S-12 A failed action says why
    Given an action on a call fails
    When I look at the calls window
    Then I can read why under the list and go on using the list
```
