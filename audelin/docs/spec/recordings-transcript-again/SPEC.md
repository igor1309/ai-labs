# Recordings — running a transcript again

Observer: compose, which builds Recordings, feeds it the row menu's
requests and answers its run port with Re-recognition
(`../re-recognition/SPEC.md`); the calls list draws its state
(`../calls-list-transcript-again/SPEC.md`). It keeps
`../transcript-again/SPEC.md`. Whether a run may start is
`../recordings-transcript-again-offer/SPEC.md`.

## Decided

- **The run's wait is in the state:** preparing, hearing with a fraction,
  finishing, each as the run port reports it.
- **Cancelling, a recording starting and shutdown each ask the port to
  stop once.** Compose sends recording started as its own event; the idle
  value only admits requests, so notes being made stop nothing.
  The port's answer decides the outcome: stopped means the transcript is
  unchanged; made means publishing had begun and finished, and the call
  shows its new transcript. A stop by a recording keeps that reason,
  unless the run was made.
- **Each outcome ends the run.** Made lists again with the call selected
  and publishes that the call's transcript changed, for compose to tell
  CallDetail; stopped and failed list nothing and keep the call selected.
- **Retrying is asking again for the failed call,** checked again as any
  request is.
- **Shutdown settles once the run port has answered.**

```gherkin
Feature: Running a transcript again

  Scenario: S-1 Waits are kept as reported
    Given a run under way
    When the run port reports preparing, hearing with a fraction, then finishing
    Then I can tell each wait, and how far hearing has got

  Scenario: S-2 A made transcript lists again
    Given a run under way
    When the run port reports made
    Then no run is under way, and the call is selected in a fresh listing

  Scenario: S-3 A failed run is named
    Given a run under way
    When the run port reports why it failed
    Then no run is under way, the call is selected, and I can read why and retry

  Scenario: S-4 Cancelling stops the run
    Given a run under way
    When I cancel and the run port reports stopped
    Then no run is under way, and I see no failure

  Scenario: S-5 A cancel too late still makes
    Given I cancelled a run while it was publishing
    When the run port reports made
    Then the call is selected in a fresh listing, and I see no failure

  Scenario: S-6 A recording stops the run
    Given a run under way
    When compose says a recording started and the run port reports stopped
    Then the run port was asked to stop once, and I can read that a recording started

  Scenario: S-7 Retrying asks again
    Given a run failed and the call is still offered
    When I retry
    Then the run port is asked for that call, and I can tell it is preparing

  Scenario: S-8 Shutdown stops a run
    Given a run under way
    When shutdown arrives
    Then the run port is asked to stop, and Recordings settles once it answers

  Scenario: S-9 Not idle alone stops nothing
    Given a run under way
    When compose says Audelin is not idle because notes are being made
    Then nothing is asked of the run port, and the run goes on

  Scenario: S-10 A made transcript is announced
    Given a run under way
    When the run port reports made
    Then I can tell that call's transcript changed
```
