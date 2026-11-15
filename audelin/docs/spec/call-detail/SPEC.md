# Call detail — Previous, Current and the notes beside a run

Observer: SummaryPreviewUI, which draws CallDetail's state and sends back
the version chosen and cancel, and the composer, which routes the cancel
intention to SummaryJobs and the menu's facts to NotesMenu. The menu is
`../notes-menu/SPEC.md`. Oracle: `../notes-templates/SPEC.md` S-5, S-6,
S-9, S-10, S-14, `../summary-preview/SPEC.md` and `../../ARCHITECTURE.md`
§ Presentation and menu.

## Machine

The existing async CallDetail machine. `State` gains the published pair,
the shown version with its template, and progress or failure beside the
pair. `Event` gains version chosen, cancel chosen and publication notified.
`Effect` reuses read notes; cancel and the menu's facts are published as
intentions and values, never effects on another machine. Each scenario is
one reducer test paired with one effect test.

## Decided

- **New Current is shown after a publication,** so the newest notes are
  what the user reads first.
- **Copy copies the shown version** (architecture § Presentation).
- **A failed or cancelled run leaves the pair readable with its outcome.**

```gherkin
Feature: Previous, Current and the notes beside a run

  Scenario: S-1 Attribution
    Given the shown notes were made with Daily
    When the detail is drawn
    Then I can draw Daily as their template

  Scenario: S-2 Switching to Previous
    Given the call has Previous and Current
    When Previous is chosen
    Then I can draw and copy Previous with its template

  Scenario: S-3 New notes show as Current
    Given Previous is shown
    When new notes are published for the call
    Then I can draw the new Current

  Scenario: S-4 A failure beside the notes
    Given the shown call has notes
    When making them again fails
    Then I can draw the failure and the notes it had

  Scenario: S-5 Cancelling beside the notes
    Given the shown call's notes are being made again
    When the run ends cancelled
    Then I can draw the notes it had with no progress

  Scenario: S-6 Cancelling making notes again
    Given the shown call's notes are being made again
    When cancel is chosen
    Then I can observe an intention to cancel the call's notes

  Scenario: S-7 The menu's facts
    Given the shown call has notes made with Daily
    When a run for it starts
    Then I can observe the call, its notes, Daily and busy published
```
