# Configure optional summaries — QA

Run the focused proofs from the named package directories. Provider calls use
spies; preference round trips use test-owned temporary files. No paid prompts,
provider installation or authentication are needed. These commands do not run
the full gate or claim visual comparison of the Settings design.

From `audelin/macos`:

```sh
CLANG_MODULE_CACHE_PATH=/tmp/codex-swift/clang timeout 600 swift test --disable-sandbox --cache-path /tmp/codex-swift/cache --config-path /tmp/codex-swift/config --security-path /tmp/codex-swift/security --filter 'SummarySettings|SummaryRuntimeTests.SummaryRuntimeTests' > /tmp/lab1034-settings-core.log 2>&1; echo "exit $?"
```

From `audelin/macos/App`:

```sh
CLANG_MODULE_CACHE_PATH=/tmp/codex-swift/clang timeout 600 swift test --disable-sandbox --cache-path /tmp/codex-swift/cache --config-path /tmp/codex-swift/config --security-path /tmp/codex-swift/security --filter 'SummarySettingsPresentationTests|SummarySettingsSafetyTests|SummaryStorageTests.summaryPreferenceSaveMergesFreshRecordingFieldsAndPreservesCorruption' > /tmp/lab1034-settings-app.log 2>&1; echo "exit $?"
```

## Proofs

| Scenario | Test and observable result |
| --- | --- |
| S-1 Disabled by default | `SummarySettingsSafetyTests.disabledUnsafeURLNeverReachesTemporaryPreferences` starts with actual default preferences, verifies notes are off, and rejects userinfo, query, fragment and remote HTTP before writing. |
| S-2 Edit both runtimes | `SummarySettingsEditTests.fieldEventsEditBothSlotsWithoutLosingEarlierEdits` retains both slots' exact edits. `SummarySettingsSafetyTests.enabledValidationAndSaveRemainBoundToTheEditedRevision` reads back the approved model from the real preferences adapter. |
| S-3 Configure local execution | `SummaryRuntimeTests.syntaxAcceptsSafeEndpointsWithoutCredentials` accepts HTTPS and IPv4/IPv6/localhost loopback HTTP without resolving credentials. `SummaryRuntimeTests.APIUsesExplicitCapAndOptionalLoopbackCredential` checks the request through an HTTP spy. |
| S-4 Choose speaker identification | `SummarySettingsEditTests.fieldEventsEditBothSlotsWithoutLosingEarlierEdits` retains the speakers choice alongside runtime edits. |
| S-5 Understand data and cost | `SummarySettingsPresentationTests.bothSlotsDiscloseRecipientsAndCostsIncludingRemoteFallback` translates reducer-produced runtime disclosures, recipients and cost text into production presentation. |
| S-6 See invalid input | `SummarySettingsSafetyTests.realValidationIdentifiesFallbackModelAndValidEditsClearTheIssue` clears the fallback model, checks the exact typed slot/field, error text, invalid marker and disabled Save, then verifies a corrected model clears obsolete feedback. `disabledUnsafeURLNeverReachesTemporaryPreferences` also verifies secrets are absent from presentation and the real preferences file remains unchanged. |
| S-7 See unavailable runtime | `SummarySettingsSafetyTests.providerFailuresIdentifyTheUnavailableFieldWithoutDiagnostics` checks missing CLI and unavailable credential-reference results through the real runtime validation adapter with provider spies. |
| S-8 See validation wait | `SummarySettingsRenderedStateTests.progressAndFailuresRemainInStateWithEditsIntact` checks validating status and disabled actions before delivering the result. |
| S-9 See saving wait | `SummarySettingsRenderedStateTests.progressAndFailuresRemainInStateWithEditsIntact` checks saving status and disabled actions. `SummarySettingsTests.validationAndSaveAreRevisionBoundAndPreventDuplicateSave` prevents duplicate save effects. |
| S-10 Recover from saving failure | `SummarySettingsRenderedStateTests.progressAndFailuresRemainInStateWithEditsIntact` checks the failure tone, retry action and intact edits/saved snapshot. `SummaryStorageTests.summaryPreferenceSaveMergesFreshRecordingFieldsAndPreservesCorruption` checks fresh recording fields survive a notes save and corrupt storage is preserved. |
| S-11 Confirm saving | `SummarySettingsSafetyTests.enabledValidationAndSaveRemainBoundToTheEditedRevision` checks saved status, success tone and persistence. `disabledSafeSaveAndValidationNeedNoInstalledOrAuthenticatedProvider` round-trips a disabled safe configuration with a missing CLI and unavailable credential reference, with zero provider calls. |
| S-12 Load settings | `SummarySettingsTests.loadFailurePreservesDataAndCanRetry` checks the load effect and resulting failure state. |
| S-13 Recover from loading failure | `SummarySettingsTests.loadFailurePreservesDataAndCanRetry` checks retry eligibility. `SummarySettingsSafetyTests.unsafeStoredValuesFailLoadWithoutEchoingOrReplacingData` rejects unsafe saved input without exposing its secret or changing the file. |
| S-14 Reject stale validation | `SummarySettingsTests.validationAndSaveAreRevisionBoundAndPreventDuplicateSave` and `SummarySettingsSafetyTests.enabledValidationAndSaveRemainBoundToTheEditedRevision` ignore old validation and require approval of the latest enabled draft. |

`SummarySettingsRenderedStateTests.pureDependenciesReceiveExactEditsAndTheirValuesAreRendered`
checks the pure dependencies' exact payloads and stub values, including no calls on
initialization or stale-result paths. `SummarySettingsSafetyTests.translationUsesMachineActionsAndRenderedFieldsWithoutDerivingPolicy`
checks Composer translates the machine's action, tone, banner and field values.
The native Settings controls and layout are unchanged.

`SummarySettingsSafetyTests.incompleteURLRemainsEditableWhileUnsafeSavesAreBlocked`
checks every typed prefix of safe endpoints remains in the presentation while
unapproved input cannot be saved. `SummarySettingsEditTests.selectingCLIDiscardsHiddenAPIFields`
checks switching to CLI removes API input that would otherwise be hidden.
