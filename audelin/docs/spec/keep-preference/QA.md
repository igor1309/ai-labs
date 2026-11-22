# Preferences, keep — QA

The adapter uses a fresh settings file per test; a failed save uses its
injected replacement binding.

## S-1 On when never set

Drive: empty settings; read back on. Evidence:
`KeepPreferenceTests.missingChoiceIsOnAndSavedChoiceSurvivesRelaunch`.

## S-2 A saved choice is read back

Drive: save off, build a new adapter on the same file; read back off.
Evidence: `KeepPreferenceTests.missingChoiceIsOnAndSavedChoiceSurvivesRelaunch`.

## S-3 A change is observed

Drive: subscribe, save off then on; read back each received value.
Evidence: `KeepPreferenceTests.successfulChangesAreObserved`.

## S-4 Other preferences keep it

Drive: save off, then save summaries, recording, language, appearance and
folder preferences; read back off after relaunch. Evidence:
`KeepPreferenceTests.otherPreferenceUpdatesPreserveKeeping`.

## S-5 A failed save is reported

Drive: replacement binding fails; save off; read back the failure and on.
Evidence: `KeepPreferenceTests.failedSaveReportsFailureAndRetainsTheChoice`.
Corrupt input is preserved by
`KeepPreferenceTests.corruptSettingsAreNotOverwrittenByAKeepChange`.
