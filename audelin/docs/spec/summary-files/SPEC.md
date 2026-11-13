# Keep notes and job records durably

Observer: the caller storing and reading a call summary job.

## Decided

- This adapter owns job records and summary output; transcript bytes are never rewritten (architecture rule 2).
- Exclusive claim creation and dispatch arbitration distinguish owner from observers; pending/running must persist before runtime work. A cross-process ownership lease stays held through terminal completion or joined cancellation/shutdown, including failed terminal saves. Its descriptor is closed on exec, and its stable location outside call folders survives rename and copied moves. Unreadable records are errors, not absence.
- Loading running work first tries to acquire its ownership lease. A busy lease proves a live owner: return running unchanged, even if output is already published. Only an acquired lease permits reconciliation using the exact job/input receipt, or interruption without replay. Release the reconciliation lease even when saving fails.
- Explicit retry requires an unchanged current interrupted or failed record and no active owner. It replaces that attempt with a fresh pending identity while retaining its saved input, configuration and checkpoint. A stale request, an active or successful record or a failed write preserves the current record, transcript and previous complete notes.
- Record immutable job/input identity, captured configuration and credential references, accepted evidence and sanitized outcomes; never credential values or raw runtime diagnostics.
- Atomic replacement uses a job/input-matched publication receipt so an old summary cannot complete a new claim; preserve existing complete output on failed replacement.
- All disk work runs on a dedicated awaited executor. Identity resolution and publication coordinate with rename, delete and whole-folder moves, including partially completed moves, through consumer-owned storage ports.
- **Notes read with when they were made: the notes file's last change.** The calls window shows that date under the notes. Publishing is unchanged and needs no time of its own; a user's later edit counts as the latest notes.
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

  Scenario: S-14 Observe a live owner
    Given another instance owns a running request
    When I load its call before or after publication
    Then I observe running without changing its claim
    And its owner can finish publishing and saving success

  Scenario: S-15 Recover an abandoned owner
    Given a running request's owner has exited without output
    When I acquire its released ownership lease and load the call
    Then I observe interruption without permission to repeat the request

  Scenario: S-16 A call without notes
    Given a call has no published notes
    When I read its notes
    Then I learn it has none, not a failure

  Scenario: S-17 Retry the current inactive attempt
    Given an interrupted or failed attempt and previous complete notes
    When I explicitly retry that exact saved record
    Then I can retrieve a fresh pending attempt with the same saved input and settings
    And I can still read the previous complete notes and unchanged transcript

  Scenario: S-18 Refuse a stale interrupted retry
    Given my saved retry request differs from the current interrupted record
    When I submit that stale request
    Then I receive a refusal and retain the current record and complete output

  Scenario: S-19 Preserve an interrupted attempt on retry failure
    Given retry cannot save a fresh attempt
    When I explicitly retry
    Then I receive a failure and retain the interrupted record and complete output

  Scenario: S-20 Notes read with when they were made
    Given a call with published notes
    When I read its notes
    Then I get them with when they were made

  Scenario: S-21 Discard a cancelled job
    Given I own a running job or its pending or interrupted attempt has no active owner
    When I discard it
    Then the call has no job record and its transcript and complete notes stay

```
