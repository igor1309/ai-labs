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

Reducer cases cover joined refreshes, recording exclusion, nil and zero
outputs, the exact thirty-second boundary, future and nonfinite times,
repeated invalidations, route changes and stale completions. Heard evidence
remains published after expiry while its start gate closes.

Doer spies hold measurement until cleanup is released, control the output
and clock on both sides, and fire expiry explicitly. Repeated observations
must perform each probe and schedule each expiry once. An old expiry cannot
clear new evidence.

App tests use the production sync model and its actor transactions. They
cover a fresh refresh with no publication, concurrent requests sharing one
probe, completion before the caller waits, generation supersession, model
shutdown, independent waiter cancellation and rejected duplicate reservations.

Recording tests hold the readiness port before each start origin, including
an automatic start deferred until the last Session ends. Refusal reports the
missing condition without beginning Session. Stops during readiness release
the reservation without starting capture; release after a running Session
waits for its cleanup.

Composition tests connect the production access and Recording models. Probe
cleanup precedes Session bring-up; silence, refusal and missing output block
both origins. A running recording launches no probe, and deferred starts
check evidence again. The menu keeps call audio available after heard
reception expires and shows it missing after invalidation.

The owner’s separate denied-permission measurement reports successful
native calls with exact zero input. Inaudibility is confirmed on the intended
outputs by the owner. These are physical platform observations, not a
reason to skip a silent production-probe result locally.
