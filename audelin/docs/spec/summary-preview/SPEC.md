# Summary preview — the call beside the list

Observer: the user, reading the selected call beside the calls list, or in
its own window when the calls window is narrow. Which call it shows, and
when, is `../calls-list/SPEC.md`; the notes are made as
`../call-summaries/SPEC.md` says. Oracle: the design brief
`../../design/calls-list.md`.

## Decided

- **No transcript here,** as the brief settles: the header, the notes and
  their actions only.
- **Notes that cannot be read show the reason in place of the notes,** so
  a broken file is told apart from a call without notes.
- **The window's toolbar holds the call's actions** as icon buttons with
  tooltips: Копировать, Открыть, Переименовать, then Удалить…, so the call
  being read can be acted on without finding its row. With no notes there
  is nothing to copy, so Копировать is disabled; with no call, all are.
  They are disabled rather than hidden, so the toolbar never shifts.
  Повторить итоги stays in the failed message and the row's menu.
- **A call without notes offers to make them,** whether notes are on or
  off in Settings. While they are made, asked for or after a call, a grey
  skeleton of notes stands in their place under «Делаю…» and «Отменить».

```gherkin
Feature: Reading the selected call

  Scenario: S-1 The header names the call
    Given a call is shown
    When I look at its top
    Then I can read the call's title, date and duration

  Scenario: S-2 Notes read as formatted text
    Given the notes have headings, lists, code and tables
    When they are shown
    Then I can read each as formatted text

  Scenario: S-3 Any part can be selected
    Given notes are shown
    When I select part of them
    Then I can copy exactly that part

  Scenario: S-4 Copying the notes
    Given notes are shown
    When I press «Копировать»
    Then I can paste the whole notes as Markdown elsewhere

  Scenario: S-5 Unreadable notes
    Given a call's notes cannot be read
    When that call is shown
    Then I can read why its notes cannot be shown

  Scenario: S-13 Notes being made
    Given the shown call's notes are being made
    When I look at it
    Then I can see that they are being made, and cancel making them

  Scenario: S-14 Notes that failed
    Given the shown call's notes failed
    When I look at it
    Then I can read why they failed

  Scenario: S-15 Retrying failed notes
    Given the shown call's notes failed
    When I press «Повторить итоги»
    Then I can see that they are being made again

  Scenario: S-16 No notes
    Given the shown call has no notes
    When I look at it
    Then I can read that it has none, and make them

  Scenario: S-17 When the notes were made
    Given notes are shown
    When I read to their end
    Then I can read when they were made

  Scenario: S-18 Nothing selected
    Given no call is selected
    When I look beside the list
    Then I can read that no call is chosen

  Scenario: S-19 The call's actions
    Given a call is shown
    When I look at the window's toolbar
    Then I can copy its notes, open, rename and delete it, each button named in its tooltip

  Scenario: S-20 Nothing to copy
    Given the shown call has no notes
    When I look at the window's toolbar
    Then «Копировать» is disabled and the other buttons still act

  Scenario: S-12 The close button closes the call's own window
    Given a call is open in its own window
    When I press its close button
    Then I cannot see that window
```
