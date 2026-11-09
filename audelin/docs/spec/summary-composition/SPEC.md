# Coordinate notes and recording

Observer: the application composing recording, storage and summary jobs.

## Decided

- Successful final snapshot write and close establish eligibility, including actual spoken entries and usable recognition; nonthrowing recording cleanup stays nonthrowing.
- Job submission never awaits generation on recording cleanup; root starts and observes jobs, maps consumer-owned interfaces and decorates attempts with fallback/logging.
- On quit stop dispatch first, finish recording cleanup, persist eligible never-started handoffs, cancel and join summary resources, then allow termination; cancellation cannot fallback. Durable running claims prevent replay even if interruption saving fails.
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
```
