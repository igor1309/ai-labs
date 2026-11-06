# Configure optional summaries — QA

Planned tests; evidence is Missing until execution. Ordering uses handshakes, never sleeps.
Rehearsal: from audelin/macos run `sh scripts/rehearsal.sh all --out <evidence-dir>`; export every designed Settings state light/dark and inspect each against its pen export before logic implementation.

## S-1 Disabled by default

Missing — planned `cd audelin/macos && swift test --filter SummarySettingsTests/disabledbydefault`. Setup fixture: I open existing preferences without summary options; drive: I look at Settings; read-back oracle: I see summaries unchecked and recording settings preserved. Feed the Settings reducer and paired effect spies; gate the named load/validation/save operation and inspect state, rendered values and latest persisted recording/summary preferences.

## S-2 Edit both runtimes

Missing — planned `cd audelin/macos && swift test --filter SummarySettingsTests/editbothruntimes`. Setup fixture: I enable summaries; drive: I edit either runtime slot and its model; read-back oracle: I can save those exact choices for upcoming jobs. Feed the Settings reducer and paired effect spies; gate the named load/validation/save operation and inspect state, rendered values and latest persisted recording/summary preferences.

## S-3 Configure local execution

Missing — planned `cd audelin/macos && swift test --filter SummarySettingsTests/configurelocalexecution`. Setup fixture: I choose a local API endpoint; drive: I enter its model without a credential reference; read-back oracle: I can save that slot and see whether fallback may send the transcript remotely. Feed the Settings reducer and paired effect spies; gate the named load/validation/save operation and inspect state, rendered values and latest persisted recording/summary preferences.

## S-4 Choose speaker identification

Missing — planned `cd audelin/macos && swift test --filter SummarySettingsTests/choosespeakeridentification`. Setup fixture: summaries are enabled; drive: I change the speakers checkbox; read-back oracle: I can save whether notes try to identify speakers. Feed the Settings reducer and paired effect spies; gate the named load/validation/save operation and inspect state, rendered values and latest persisted recording/summary preferences.

## S-5 Understand data and cost

Missing — planned `cd audelin/macos && swift test --filter SummarySettingsTests/understanddataandcost`. Setup fixture: I choose primary and fallback runtimes; drive: I read their disclosures; read-back oracle: I can see who receives the transcript and how each service charges or limits use. Feed the Settings reducer and paired effect spies; gate the named load/validation/save operation and inspect state, rendered values and latest persisted recording/summary preferences.

## S-6 See invalid input

Missing — planned `cd audelin/macos && swift test --filter SummarySettingsTests/seeinvalidinput`. Setup fixture: a required configuration value is invalid; drive: I try to save; read-back oracle: I can see the field to correct and cannot replace the last saved settings. Feed the Settings reducer and paired effect spies; gate the named load/validation/save operation and inspect state, rendered values and latest persisted recording/summary preferences.

## S-7 See unavailable runtime

Missing — planned `cd audelin/macos && swift test --filter SummarySettingsTests/seeunavailableruntime`. Setup fixture: the selected executable is missing; drive: I validate settings; read-back oracle: I can read which runtime is unavailable. Feed the Settings reducer and paired effect spies; gate the named load/validation/save operation and inspect state, rendered values and latest persisted recording/summary preferences.

## S-8 See validation wait

Missing — planned `cd audelin/macos && swift test --filter SummarySettingsTests/seevalidationwait`. Setup fixture: runtime validation is unfinished; drive: I look at Settings; read-back oracle: I can see validation is running without mistaking it for readiness. Feed the Settings reducer and paired effect spies; gate the named load/validation/save operation and inspect state, rendered values and latest persisted recording/summary preferences.

## S-9 See saving wait

Missing — planned `cd audelin/macos && swift test --filter SummarySettingsTests/seesavingwait`. Setup fixture: saving has begun; drive: I look at Settings; read-back oracle: I can see saving is unfinished and cannot submit a duplicate save. Feed the Settings reducer and paired effect spies; gate the named load/validation/save operation and inspect state, rendered values and latest persisted recording/summary preferences.

## S-10 Recover from saving failure

Missing — planned `cd audelin/macos && swift test --filter SummarySettingsTests/recoverfromsavingfailure`. Setup fixture: writing preferences fails; drive: I look at Settings; read-back oracle: I can see the failure and retry with my edits intact. Feed the Settings reducer and paired effect spies; gate the named load/validation/save operation and inspect state, rendered values and latest persisted recording/summary preferences.

## S-11 Confirm saving

Missing — planned `cd audelin/macos && swift test --filter SummarySettingsTests/confirmsaving`. Setup fixture: my edits are valid; drive: saving completes; read-back oracle: I can see the saved choices that upcoming jobs will use. Feed the Settings reducer and paired effect spies; gate the named load/validation/save operation and inspect state, rendered values and latest persisted recording/summary preferences.

## S-12 Load settings

Missing — planned `cd audelin/macos && swift test --filter SummarySettingsTests/loadsettings`. Setup fixture: saved settings are being read; drive: I open Settings; read-back oracle: I can see loading instead of editable placeholder values. Feed the Settings reducer and paired effect spies; gate the named load/validation/save operation and inspect state, rendered values and latest persisted recording/summary preferences.

## S-13 Recover from loading failure

Missing — planned `cd audelin/macos && swift test --filter SummarySettingsTests/recoverfromloadingfailure`. Setup fixture: saved settings cannot be read; drive: I open Settings; read-back oracle: I can read the error and retry without replacing stored settings. Feed the Settings reducer and paired effect spies; gate the named load/validation/save operation and inspect state, rendered values and latest persisted recording/summary preferences.

## S-14 Reject stale validation

Missing — planned `cd audelin/macos && swift test --filter SummarySettingsTests/rejectstalevalidation`. Setup fixture: I change edits while validation runs; drive: the older result arrives; read-back oracle: I cannot save new edits on the basis of the older result. Feed the Settings reducer and paired effect spies; gate the named load/validation/save operation and inspect state, rendered values and latest persisted recording/summary preferences.
