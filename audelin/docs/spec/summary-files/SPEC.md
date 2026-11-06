# Keep notes and job records durably

Observer: the caller storing and reading a call summary job.

## Decided

- This adapter owns job records and summary output; transcript bytes are never rewritten (architecture rule 2).
- Exclusive claim creation and dispatch arbitration distinguish owner from observers; pending/running must persist before runtime work. Unreadable records are errors, not absence.
- Record immutable job/input identity, captured configuration and credential references, accepted evidence and sanitized outcomes; never credential values or raw runtime diagnostics.
- Atomic replacement uses a job/input-matched publication receipt so an old summary cannot complete a new claim; preserve existing complete output on failed replacement.
- All disk work runs on a dedicated awaited executor. Identity resolution and publication coordinate with rename, delete and whole-folder moves, including partially completed moves, through consumer-owned storage ports.
- Failed terminal-state saving leaves a durable running claim, so recovery cannot replay an already dispatched request. These choices preserve output and avoid duplicate billing.

```gherkin
Feature: Keep notes and job records durably

  Scenario: S-1 Persist a claim
    Given a call has no job
    When I claim it twice
    Then I can retrieve one durable pending job

  Scenario: S-2 Reload progress
    Given a claimed job changes progress
    When I reload it
    Then I can retrieve the saved phase and sanitized error

  Scenario: S-3 Publish notes atomically
    Given a call has a transcript
    When I save notes
    Then I can read complete notes beside the unchanged transcript

  Scenario: S-4 Preserve files on write failure
    Given a complete summary already exists
    When replacing it fails
    Then I can read the previous complete notes with no partial replacement

  Scenario: S-5 Reconcile interrupted status
    Given summary output committed before a status-write failure
    When I reload the job
    Then I can retrieve success without requesting generation

  Scenario: S-6 Follow a renamed call
    Given a claimed call folder is renamed
    When I finish saving notes
    Then I can read the notes in the current call folder

  Scenario: S-7 Report missing call
    Given a call is removed during generation
    When I save the result
    Then I receive a failure without recreating the deleted call

  Scenario: S-8 Concurrent claim has one owner
    Given two submissions target the same unclaimed call
    When both try to claim it
    Then only one can dispatch while the other observes its job

  Scenario: S-9 Unreadable record is not absence
    Given a previous job record is unreadable
    When I claim the call
    Then I receive a recovery failure without permission to dispatch

  Scenario: S-10 Old notes do not complete a new job
    Given existing notes belong to another job
    When I recover the current job
    Then I cannot mistake the old notes for current success

  Scenario: S-11 Move a partially moved call
    Given a calls-folder move has partially completed
    When notes finish for an already moved call
    Then I can read the complete notes in its current folder without recreating the source

  Scenario: S-12 Failed progress save
    Given a job is claimed
    When saving running progress fails
    Then I receive a storage failure without permission to request generation

  Scenario: S-13 Reject mismatched input receipt
    Given existing output names the current job but another input
    When I recover the current job
    Then I cannot mistake that output for current success
```
