# Produce notes independently of recording — QA

Planned tests; evidence is Missing until execution. Ordering uses handshakes, never sleeps.

## S-1 Disabled job

Missing — planned `cd audelin/macos && swift test --filter SummaryJobsTests/disabledjob`. Setup fixture: summaries are disabled; drive: a final transcript is offered; read-back oracle: I can finish without requesting runtime work. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-2 Wait for final text

Missing — planned `cd audelin/macos && swift test --filter SummaryJobsTests/waitforfinaltext`. Setup fixture: a transcript is still being finalized; drive: an end notification arrives; read-back oracle: I can observe waiting without a runtime request. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-3 Reject unusable text

Missing — planned `cd audelin/macos && swift test --filter SummaryJobsTests/rejectunusabletext`. Setup fixture: final text contains no spoken entries; drive: completion is offered; read-back oracle: I can observe a reason notes are unavailable without a runtime request. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-4 Make notes

Missing — planned `cd audelin/macos && swift test --filter SummaryJobsTests/makenotes`. Setup fixture: eligible final text and settings are captured; drive: a runtime returns notes; read-back oracle: I can read the complete notes and successful completion. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-5 Fall back per failed step

Missing — planned `cd audelin/macos && swift test --filter SummaryJobsTests/fallbackperfailedstep`. Setup fixture: a primary step fails; drive: fallback succeeds; read-back oracle: I can retrieve the fallback step result. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-6 Record exhausted notes failure

Missing — planned `cd audelin/macos && swift test --filter SummaryJobsTests/recordexhaustednotesfailure`. Setup fixture: both notes attempts fail; drive: the job finishes; read-back oracle: I can retrieve a sanitized failure without losing the transcript. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-7 Continue after identification failure

Missing — planned `cd audelin/macos && swift test --filter SummaryJobsTests/continueafteridentificationfailure`. Setup fixture: both identification attempts fail; drive: notes succeed using original labels; read-back oracle: I can retrieve notes with a speaker warning. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-8 Keep successful identification

Missing — planned `cd audelin/macos && swift test --filter SummaryJobsTests/keepsuccessfulidentification`. Setup fixture: speaker evidence has been accepted; drive: primary notes fail and fallback succeeds; read-back oracle: I can retrieve notes using those names without another identification request. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-9 Deduplicate completion

Missing — planned `cd audelin/macos && swift test --filter SummaryJobsTests/deduplicatecompletion`. Setup fixture: a call already has a claimed job; drive: its completion arrives again; read-back oracle: I can observe the same job without additional runtime work. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-11 Reload safely

Missing — planned `cd audelin/macos && swift test --filter SummaryJobsTests/reloadsafely`. Setup fixture: a claimed job was running when the app exited; drive: jobs are loaded; read-back oracle: I can observe interruption without automatic runtime work. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-12 Resume pending work

Missing — planned `cd audelin/macos && swift test --filter SummaryJobsTests/resumependingwork`. Setup fixture: a persisted job never started runtime work; drive: jobs are loaded; read-back oracle: I can resume that job using its saved configuration. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-13 Report output failure

Missing — planned `cd audelin/macos && swift test --filter SummaryJobsTests/reportoutputfailure`. Setup fixture: notes are generated; drive: saving them fails; read-back oracle: I can observe failure without publishing partial notes. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-14 Cancel cleanly

Missing — planned `cd audelin/macos && swift test --filter SummaryJobsTests/cancelcleanly`. Setup fixture: a runtime request is active; drive: the job is cancelled; read-back oracle: I can await its end with no fallback request. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-15 Reject failed final text

Missing — planned `cd audelin/macos && swift test --filter SummaryJobsTests/rejectfailedfinaltext`. Setup fixture: the latest final write failed; drive: completion is offered; read-back oracle: I can read why notes are unavailable without a runtime request. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-16 Do not dispatch after storage failure

Missing — planned `cd audelin/macos && swift test --filter SummaryJobsTests/donotdispatchafterstoragefailure`. Setup fixture: the running claim cannot be saved; drive: dispatch is attempted; read-back oracle: I can read the storage failure without runtime work. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

## S-17 Observe pending work

Missing — planned `cd audelin/macos && swift test --filter SummaryJobsTests/observependingwork`. Setup fixture: a claimed eligible job is held before dispatch; drive: I inspect progress; read-back oracle: I can distinguish waiting from an active request. Gate claim/runtime/checkpoint ports as named, count adapter invocations and read saved output/state; compare original transcript bytes.

Prompt fixture: `SummaryJobsTests/promptForbidsUnsupportedFacts` inspects the actual outbound instruction; `no-decisions-actions-ru` transcript/expected response retains localized “none recorded” decisions/actions and omits absent open questions. Evidence Missing.
