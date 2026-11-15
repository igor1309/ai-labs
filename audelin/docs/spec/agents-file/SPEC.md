# Agents file — AGENTS.md in the recordings root

Observer: the user, who wants an AI agent asked about their calls to know
how the recordings root is laid out, and finds the offer in Settings →
General (`../../design/general-settings.md`, "AGENTS.md for AI agents").
The file's text is `../../agents-md.md`. Oracle: the design brief and the
owner's rulings on LAB-1647.

## Decided

- **The file is written only when the user asks,** with the row's button;
  Audelin never writes, rewrites or updates it on its own (owner, LAB-1647).
- **The text is fixed English,** whatever the UI language (owner, LAB-1647):
  an agent reads it, not the user.
- **An `AGENTS.md` already there is never overwritten,** whoever wrote it,
  even if its text differs: it may be the user's own. Presence is all the
  row checks, so a user's own file hides the row too.
- **Presence is checked each time General is shown and after the button,**
  so a file the user deleted outside Audelin brings the row back without a
  relaunch; no file watching is added for one row.
- **No row while the recordings root itself is unavailable:** there is
  nowhere to write, and that condition is Recording's to show.
- **A failed write keeps the row and says why** (the design left this
  open): the hint line is replaced by «Не удалось создать AGENTS.md:
  <причина>» / "Couldn't create AGENTS.md: <reason>" in the hint's own
  style, with the system's reason, and the button stays enabled to retry.
  Showing it in place keeps the one row and needs no new token; a retry
  that succeeds hides the row as usual.
- **The file is written whole or not at all** (atomic write), readable by
  the user only like the call folders, so a failure never leaves half a file.
- **The text is pinned to the layout code:** a change to what a call folder
  holds updates `agents-md.md` in the same PR, and a test compares the
  written bytes with it.

```gherkin
Feature: Explaining the recordings root to AI agents

  Scenario: S-1 Offered while the file is missing
    Given the recordings root has no AGENTS.md
    When I open Settings → General
    Then I can see that the file is missing, why it helps, and a button to create it

  Scenario: S-2 Creating the file
    Given General offers to create AGENTS.md
    When I press the button
    Then an AI agent can read in the recordings root how the calls are laid out and how to find them
    And I can no longer see the offer

  Scenario: S-3 Not offered while the file exists
    Given the recordings root has an AGENTS.md
    When I open Settings → General
    Then I cannot see the offer

  Scenario: S-4 My own AGENTS.md is kept
    Given the recordings root has an AGENTS.md I wrote
    When I use Audelin, record calls or open Settings
    Then I can still read my file as I wrote it

  Scenario: S-5 Never written without me
    Given the recordings root has no AGENTS.md
    When I record, merge, tag or summarize calls and relaunch Audelin
    Then I can see no AGENTS.md in the recordings root

  Scenario: S-6 Offered again after I delete it
    Given I deleted AGENTS.md from the recordings root outside Audelin
    When I open Settings → General again
    Then I can see the offer again

  Scenario: S-7 A failed write is explained
    Given the recordings root cannot be written to
    When I press the button
    Then I can read why the file was not created and press the button again

  Scenario: S-8 Not offered without a recordings root
    Given the recordings root is unavailable
    When I open Settings → General
    Then I cannot see the offer
```
