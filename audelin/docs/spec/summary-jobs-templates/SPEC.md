# Summary jobs — notes made again with a template

Observer: the composition root, which sends SummaryJobs a call's intentions
from CallDetail and reads its progress and publication notifications. The
first-notes line is `../summary-jobs/SPEC.md`; this spec adds templates,
runs after success and the keep choice. Oracle: `../notes-templates/SPEC.md`
S-2 to S-4, S-6, S-7, S-9 to S-11 and `../../ARCHITECTURE.md` § Generation.

## Machine

One async machine, as `../summary-jobs/SPEC.md`. `State` gains, per call,
the requested template, the resolved template, the captured keep choice and
the candidate notes. `Event` gains a generate request (call, template), the
template resolution's answer and the keep choice's answer. `Effect` gains
resolve template, read keep choice, and commit with rotation or
replacement. Each scenario is one reducer test paired with one effect test.

## Decided

- **A run after success is admitted,** as a first run or a retry is; a
  second run while one is under way is refused.
- **Template and keep choice are captured when a run is prepared** and saved
  with the attempt, so recovery uses the same instructions and a later
  toggle changes only later runs.
- **Automatic notes use Default;** a chosen template is never replaced.
- **Rotation or replacement is chosen here** from the captured choice;
  failure or cancellation leaves the published pair untouched.

```gherkin
Feature: Notes made again with a template

  Scenario: S-1 Make notes with a chosen template
    Given a call without notes
    When notes are requested with Daily
    Then I can observe progress with Daily, then completion made with Daily

  Scenario: S-2 Make notes again after success
    Given a call whose notes were made
    When notes are requested again
    Then I can observe a new run's progress

  Scenario: S-3 One run at a time
    Given a call's notes are being made
    When notes are requested for it again
    Then I can observe the run already under way, and no second request

  Scenario: S-4 Automatic notes use Default
    Given automatic notes are on
    When a final transcript is offered
    Then I can observe progress made with Default

  Scenario: S-5 Keeping on rotates
    Given keeping is on when a run is prepared
    When its notes are saved
    Then I can observe a publication that keeps the old Current as Previous

  Scenario: S-6 Keeping off replaces
    Given keeping is off when a run is prepared
    When its notes are saved
    Then I can observe a publication that keeps only the new notes

  Scenario: S-7 A later toggle does not change a run
    Given keeping was on when a run was prepared
    When keeping is turned off before the notes are saved
    Then I can observe a publication that keeps the old Current as Previous

  Scenario: S-8 A failure keeps the published notes
    Given a call with notes is being made again
    When the attempt fails
    Then I can observe the failure and no publication

  Scenario: S-9 Cancelling keeps the published notes
    Given a call with notes is being made again
    When the run is cancelled
    Then I can observe the run ended and no publication

  Scenario: S-10 A template that cannot be resolved
    Given the chosen template is missing
    When its run is prepared
    Then I can observe that failure without a runtime request

  Scenario: S-11 Recovery uses the saved template
    Given a run with Daily was pending when the app exited
    When jobs are loaded
    Then I can resume it with Daily's saved instructions
```
