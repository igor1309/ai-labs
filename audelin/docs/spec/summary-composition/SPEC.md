# Coordinate notes and recording

Observer: the application composing recording, storage and summary jobs.

## Decided

- Successful final snapshot write and close establish eligibility, including actual spoken entries and usable recognition; nonthrowing recording cleanup stays nonthrowing.
- Job submission never awaits generation on recording cleanup; root starts and observes jobs, maps consumer-owned interfaces and decorates attempts with fallback/logging.
- On quit stop dispatch first, finish recording cleanup, persist eligible never-started handoffs, cancel and join summary resources, then allow termination; cancellation cannot fallback. Durable running claims prevent replay even if interruption saving fails.
- Automatic updates wait from submission or retry reservation through asynchronous dispatch and terminal saving. A dispatch approval remains in coordinator state until the job processes it; stopping dispatch withdraws unprocessed approvals and leaves their jobs pending.
- Before permitting an update, reread observed calls, including interrupted calls another instance can retry. Unresolved ownership stays protected on missing, unreadable or invalid records; a confirmed inactive record releases protection. Observer refresh never replaces a locally executing job.
- Explicit retry replaces only the current interrupted or failed attempt with a fresh identity, using its saved input and runtime settings. Refusal or storage failure is shown to the caller; a later retry clears that call’s previous retry error.
- A transcript read failure before submission retries reading through the call's notes machine; there is no stored attempt to retry. One request starts one attempt.
- Storage coordinates publication with existing rename/delete/move operations, resolving call identity even before a whole-folder move commits its new preference.

```gherkin
Feature: Coordinate notes and recording

  Scenario: S-1 Wait for final write
    Given the final transcript write is held
    When call end arrives
    Then I cannot dispatch notes until the successful write and close finish

  Scenario: S-2 Accept recovered write
    Given an earlier write failed but the latest final write succeeds
    When the transcript closes
    Then I can dispatch notes for its actual spoken entries

  Scenario: S-3 Reject stale saved text
    Given the final write failed after an older write succeeded
    When the transcript closes
    Then I cannot dispatch notes from the stale file

  Scenario: S-4 Start another call
    Given an earlier summary request is held
    When another call begins
    Then I can start recording without waiting for generation

  Scenario: S-5 Quit joins cleanup
    Given a generation request is active
    When the app quits
    Then I can terminate after cancellation cleanup without fallback

  Scenario: S-6 Quit during handoff
    Given recording is ending when quit stops dispatch
    When final text becomes eligible
    Then I can retain pending work without beginning a request during shutdown

  Scenario: S-7 Complete during folder move
    Given a calls-folder move is copying a call
    When notes finish
    Then I can read one complete result in the moved call

  Scenario: S-8 Update during asynchronous dispatch
    Given an eligible summary is approved for dispatch but its job has not processed the approval
    When an automatic update checks whether it can restart
    Then I keep the app running through dispatch, generation, publication and terminal saving

  Scenario: S-9 Another instance retries an interrupted call
    Given I loaded an interrupted call and another instance retries it
    When an automatic update checks whether it can restart
    Then I observe the fresh attempt and wait until its terminal save

  Scenario: S-10 Completion cannot be established
    Given I observe another summary owner
    When an update check cannot read a valid record for that call
    Then I keep the update blocked until a successful reread establishes inactive work

  Scenario: S-11 Retry after an earlier error
    Given an explicit retry failed and its storage is usable again
    When I retry that call successfully
    Then I can follow the new attempt without the previous retry error
    And retry errors for other calls remain unchanged

  Scenario: S-12 Make on request with automatic notes off
    Given automatic notes are off and a saved call has no notes
    When I make its notes from its row or detail
    Then I see making followed by the notes and their made date using the saved model settings

  Scenario: S-13 Cancel only the requested attempt
    Given two calls are making notes
    When I cancel one call's notes
    Then it has no notes or job record and I can make them again
    And the other call keeps its job, as does a later attempt stopped by app exit

  Scenario: S-14 Call end starts the call's notes machine
    Given automatic notes are on and a call ends with usable final text
    When I read that call while generation is held
    Then I see making followed by its notes when generation completes

```
