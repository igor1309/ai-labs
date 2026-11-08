# Optional call notes

Observer: the person recording and reading a call.

```gherkin
Feature: Optional call notes

  Scenario: S-1 No notes without permission
    Given I have not enabled call summaries
    When a call finishes
    Then I keep the transcript without sending it to a summary provider

  Scenario: S-2 Choose where notes are made
    Given I open Settings
    When I enable summaries and save my runtime choices
    Then I can see the primary, fallback, models, cost and transcript recipients

  Scenario: S-3 Wait for the last words
    Given summaries are enabled and recognition is finishing
    When I open the ended call
    Then I can read that notes wait for the final transcript

  Scenario: S-4 See notes being made
    Given the final transcript is ready
    When notes begin
    Then I can read that notes are being prepared while another call can record

  Scenario: S-5 Read faithful notes
    Given a call has a final transcript
    When notes finish
    Then I can read structured notes in the meeting language beside the unchanged transcript

  Scenario: S-6 Keep unknown speakers
    Given speaker identification is enabled
    When the transcript does not establish a speaker name
    Then I can read notes retaining that speaker label

  Scenario: S-7 Use the fallback
    Given the primary runtime cannot complete a step
    When the fallback completes it
    Then I can read the resulting notes

  Scenario: S-8 Keep a call when notes fail
    Given both runtimes fail to make notes
    When I open the call
    Then I can read the failure and still use the transcript and recording

  Scenario: S-9 Avoid misleading notes
    Given the final transcript is empty
    When the call finishes
    Then I can see why notes were not generated

  Scenario: S-10 Keep failed text separate
    Given transcript finalization fails
    When the call finishes
    Then I can see notes are unavailable without losing the text already saved

  Scenario: S-11 Read after restarting
    Given notes were being requested when the app exited
    When I reopen Audelin
    Then I can see interruption without being charged for an automatic repeat

  Scenario: S-12 Read after a file failure
    Given notes cannot be saved
    When I open the call
    Then I can see the save failure and still use the transcript

  Scenario: S-13 Read a speaker warning
    Given identification failed but notes succeeded
    When I open the call
    Then I can read the notes and the speaker warning

  Scenario: S-14 Read storage failure
    Given initial job ownership cannot be saved
    When I open the call
    Then I can read why notes cannot proceed and still open the transcript

  Scenario: S-15 Read recovery failure
    Given a previous job record cannot be read
    When I reopen Audelin
    Then I can read the recovery failure without an automatic generation request

  Scenario: S-16 Read progress saving failure
    Given running job progress cannot be saved
    When I open the call
    Then I can read the storage failure and still open the transcript

  Scenario: S-17 Read waiting notes
    Given eligible notes are durably pending and dispatch is held
    When I open the call
    Then I can read that notes are waiting to start

  Scenario: S-18 Read reloaded waiting notes
    Given a never-started pending job is loaded after restart
    When dispatch remains held
    Then I can read that notes are waiting to start
```
