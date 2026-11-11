# Summary preview

Observer: the user, reading one call's notes in the preview panel. Which
call it shows, and when, is `../calls-list/SPEC.md`; the notes are made as
`../call-summaries/SPEC.md` says. Oracle: the design brief
`../../design/summary-preview.md` (panel B1).

## Decided

- **The panel has no transcript link,** as the brief settles; it shows the
  header, the copy button and the notes only.
- **Notes that cannot be read show the reason in place of the notes,** so
  a broken file is told apart from a call without notes.

```gherkin
Feature: Reading a call's notes

  Scenario: S-1 The header names the call
    Given the panel shows a call
    When I look at its top
    Then I can read the call's title, date and duration

  Scenario: S-2 Notes read as formatted text
    Given the notes have headings, lists, code and tables
    When the panel shows them
    Then I can read each as formatted text

  Scenario: S-3 Any part can be selected
    Given the panel shows notes
    When I select part of them
    Then I can copy exactly that part

  Scenario: S-4 Copying the notes
    Given the panel shows notes
    When I press «Копировать»
    Then I can paste the whole notes as Markdown elsewhere

  Scenario: S-5 Unreadable notes
    Given a call's notes cannot be read
    When the panel shows that call
    Then I can read why its notes cannot be shown

  Scenario: S-6 The panel stays above the list
    Given the panel is open
    When I click in the calls list and move through it
    Then I can still see the panel above the list

  Scenario: S-7 The eye brings the panel forward
    Given the panel is behind another Audelin window
    When I press an eye in the calls list
    Then I can see the panel in front

  Scenario: S-8 Another app hides the panel
    Given the panel is open
    When I switch to another app
    Then I cannot see the panel

  Scenario: S-9 Coming back shows the panel
    Given the panel was hidden by switching apps
    When I come back to Audelin
    Then I can see the panel where it was

  Scenario: S-10 The place holds across calls
    Given I moved and resized the panel
    When it shows another call
    Then I find it where I left it, at the size I left it

  Scenario: S-11 The place holds across restarts
    Given I moved and resized the panel
    When I restart Audelin and open the panel
    Then I find it where I left it, at the size I left it

  Scenario: S-12 The close button closes the panel
    Given the panel is open
    When I press its close button
    Then I cannot see the panel
```
