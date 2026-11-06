# Produce notes independently of recording

Observer: the composition root requesting and observing notes.

## Decided

- A pure reducer and effect handler own job decisions through consumer-owned ports; root composition alone connects concrete components (architecture rules 1–4).
- Root fallback decorates each step: one primary adapter invocation and at most one fallback invocation, after transport and domain validation; cancellation never falls back. Unavoidable provider internal billing is not an invocation guarantee.
- Eligibility requires the latest final snapshot successfully written, subsequent closure, usable recognition and actual spoken entries; placeholder Markdown is not speech. Earlier recovered writes do not disqualify a successful final write.
- Only exclusive dispatch ownership can request generation; concurrent completion and startup recovery share arbitration. Existing records are observed, not dispatched twice.
- Failed claim, running or speaker-checkpoint persistence prevents further requests. Corrupt records fail visibly, never become absent records.
- Pending work retains an immutable configuration snapshot; running requests reload as interrupted. A committed output must match the claimed job and input to recover success.
- Accepted speaker evidence is checkpointed before notes; a failed notes attempt reuses that checkpoint. Speaker acceptance is owned by speaker-identification.
- Notes prompt forbids invented facts, decisions, commitments, owners and deadlines; only transcript-supported content is allowed. Required meeting-language sections are topic, key points, decisions and actions; absent decisions/actions say localized “none recorded”, and absent open questions omit that section. Structural/refusal/truncation validation cannot mechanically prove factual faithfulness; synthetic language and hallucination fixtures challenge the prompt.

```gherkin
Feature: Produce notes independently of recording

  Scenario: S-1 Disabled job
    Given summaries are disabled
    When a final transcript is offered
    Then I can finish without requesting runtime work

  Scenario: S-2 Wait for final text
    Given a transcript is still being finalized
    When an end notification arrives
    Then I can observe waiting without a runtime request

  Scenario: S-3 Reject unusable text
    Given final text contains no spoken entries
    When completion is offered
    Then I can observe a reason notes are unavailable without a runtime request

  Scenario: S-4 Make notes
    Given eligible final text and settings are captured
    When a runtime returns notes
    Then I can read the complete notes and successful completion

  Scenario: S-5 Fall back per failed step
    Given a primary step fails
    When fallback succeeds
    Then I can retrieve the fallback step result

  Scenario: S-6 Record exhausted notes failure
    Given both notes attempts fail
    When the job finishes
    Then I can retrieve a sanitized failure without losing the transcript

  Scenario: S-7 Continue after identification failure
    Given both identification attempts fail
    When notes succeed using original labels
    Then I can retrieve notes with a speaker warning

  Scenario: S-8 Keep successful identification
    Given speaker evidence has been accepted
    When primary notes fail and fallback succeeds
    Then I can retrieve notes using those names without another identification request

  Scenario: S-9 Deduplicate completion
    Given a call already has a claimed job
    When its completion arrives again
    Then I can observe the same job without additional runtime work

  Scenario: S-11 Reload safely
    Given a claimed job was running when the app exited
    When jobs are loaded
    Then I can observe interruption without automatic runtime work

  Scenario: S-12 Resume pending work
    Given a persisted job never started runtime work
    When jobs are loaded
    Then I can resume that job using its saved configuration

  Scenario: S-13 Report output failure
    Given notes are generated
    When saving them fails
    Then I can observe failure without publishing partial notes

  Scenario: S-14 Cancel cleanly
    Given a runtime request is active
    When the job is cancelled
    Then I can await its end with no fallback request

  Scenario: S-15 Reject failed final text
    Given the latest final write failed
    When completion is offered
    Then I can read why notes are unavailable without a runtime request

  Scenario: S-16 Do not dispatch after storage failure
    Given the running claim cannot be saved
    When dispatch is attempted
    Then I can read the storage failure without runtime work

  Scenario: S-17 Observe pending work
    Given a claimed eligible job is held before dispatch
    When I inspect progress
    Then I can distinguish waiting from an active request
```
