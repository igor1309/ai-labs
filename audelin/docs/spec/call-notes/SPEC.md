# Call notes — making a call's notes on request

Observer: the user, reading one call in the calls window. How the window
draws each state is `../summary-preview/SPEC.md`; how notes are made and
kept is `../summary-jobs/SPEC.md` and `../summary-files/SPEC.md`.
Oracle: the design brief `../../design/calls-list.md`.

## Decided

- **The machine keeps no clock.** How long making may take, and failing
  when it takes too long, belong to whatever makes the notes; the machine
  waits for its outcome.
- **Cancelling returns the call to no notes, with no error.** The user chose
  to stop; nothing failed. Whatever makes the notes never reports a run
  it was told to stop, so a cancelled run's notes never show.
- **A call's notes are made once at a time.** Make, retry or cancel sent
  while they cannot apply change nothing.
- **Notes submitted after a call start the call in being made,** so the
  window shows the same thing whether the user or the end of a call asked.

```gherkin
Feature: Making a call's notes on request

  Scenario: S-1 A call without notes offers to make them
    Given a call has no notes
    When I read the call
    Then I can ask to make its notes

  Scenario: S-2 Asking starts making
    Given a call has no notes
    When I ask to make its notes
    Then I can see that they are being made
    And I can cancel

  Scenario: S-3 Made notes replace the progress
    Given a call's notes are being made
    When they are made
    Then I can read them and when they were made

  Scenario: S-4 A failure is shown
    Given a call's notes are being made
    When making them fails
    Then I can read why
    And I can try again

  Scenario: S-5 Trying again starts making
    Given making a call's notes failed
    When I try again
    Then I can see that they are being made

  Scenario: S-6 Cancelling returns to no notes
    Given a call's notes are being made
    When I cancel
    Then I can ask to make its notes again
    And I see no error

  Scenario: S-7 Asking twice makes them once
    Given a call's notes are being made
    When I ask to make them again
    Then they are made once

  Scenario: S-8 Notes submitted after a call
    Given notes were submitted when a call ended
    When I read the call
    Then I can see that they are being made

```
