# Call detail — Previous, Current and the notes beside a run

Observer: SummaryPreviewUI, which draws CallDetail's state and sends back
the version the user chooses. The menu is `../call-detail-templates/SPEC.md`,
whose Machine section names the `State`, `Event` and `Effect` this spec
uses: here the shown version, its template, and progress beside the pair.
Each scenario is one reducer test paired with one effect test. Oracle:
`../notes-templates/SPEC.md` S-5, S-6, S-9, S-10, S-14 and
`../../ARCHITECTURE.md` § Presentation.

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
```
