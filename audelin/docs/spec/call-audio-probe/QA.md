# Call audio reception probe — QA

Unit suites use native-call and player spies, manual timer callbacks and an
injected clock. No unit result depends on a sleep or elapsed wall time.
The real suite is serialized, bounded to one minute and disabled on GitHub
Actions; a local silent result fails.

## Reception and cleanup

`finiteNonzeroTapSampleIsHeard` and
`coveredZerosAfterSuccessfulRenderAreSilent` distinguish received input.
`missingOutputAndIncompleteCoverageAreRefused`,
`renderAndEachNativeFailureAreRefused`,
`nonfiniteSamplesCannotEstablishHeard` and
`timeoutAndNonStimulusAudioCannotEstablishAccess` cover failures and
input outside the stimulus. `toneStartsOnlyAfterMutingTapAndCaptureAreReady`
checks the own process identity, private muted tap, private aggregate,
manual start and absence of hardware subdevices. The native seam has no
property-write operation.

`cancellationAndLateCallbacksReleaseResourcesOnce` and
`playerStopsBeforeTapRemoval` prove completion and resource order.
`realOwnProcessProbeHearsMutedStimulus` calls the production adapter and
requires heard after teardown.

## Freshness and exclusion

`onlyFreshHeardAllowsStart`,
`silentRefusedAndMissingOutputBlockBothStartOrigins`,
`expiredOrInvalidatedEvidenceRequiresRefresh`,
`concurrentRefreshesShareOneProbe` and
`invalidationDuringMeasurementRejectsLateEvidence` assert reducer state
and effect results. `effectUsesPostCleanupClockAndRejectsChangedOutput`
checks completion time and a route change during measurement.

Compose's `cleanupCompletesBeforeSessionStarts`,
`runningRecordingDoesNotLaunchProbe` and
`deferredStartRechecksEvidence` exercise the production app models through
the connected recording inputs. Both start origins are blocked by silence,
refusal and missing output. `startupRefreshPromptsAndInvalidationRemovesMenuAccess`
checks the launch refresh and existing missing-call-audio menu mapping.

The owner’s separate denied-permission measurement reports successful
native calls with exact zero input. Inaudibility is confirmed on the intended
outputs by the owner. These are physical platform observations, not a
reason to skip a silent production-probe result locally.
