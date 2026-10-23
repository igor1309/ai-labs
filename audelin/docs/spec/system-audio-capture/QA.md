# System audio capture — QA

Fake tests mix tones, change rate, refuse requests and hold IO. Native spies
check tap and aggregate settings, IO, listeners and teardown. Real rows use
`afplay -v 0.02` on a tone in a temp dir; denied permission can give silence.

## S-1 A named process is heard

Fake: every included tone is read live, unmuted and mono. Native: PIDs become
process objects. Real: the faint tone exceeds the noise floor. Evidence:
`SystemAudioCaptureTests.aNamedProcessIsHeardWithoutMutingPlayback`,
`SystemAudioCaptureTests.piecesAreReadWhileTheCaptureIsRunning`,
`SystemAudioCaptureTests.severalProcessesAreSelectedAtStartAndOnRenaming`,
`NativeCaptureBindingTests.nativeTapDescriptionTranslatesEveryProcess`, `NativeCaptureBindingTests.nativeAggregateContainsOnlyItsPrivateManualTap`,
`CoreAudioBindingTests.realFaintAfplayToneIsHeard`.

## S-2 Newly named processes are heard in the same capture

Fake: several newly included tones replace the old selection without restarting.
Native: rename writes a description with the same UUID. Evidence:
`SystemAudioCaptureTests.newlyNamedProcessesAreHeardInTheSameCapture`,
`SystemAudioCaptureTests.severalProcessesAreSelectedAtStartAndOnRenaming`,
`NativeCaptureBindingTests.runningRenameWritesTheNativeTapDescription`.

## S-5 A new output device keeps the sound heard

Fake: tones survive an output change. Native: exact samples and rates stay in delivery order. Evidence:
`SystemAudioCaptureTests.aNewOutputDeviceChangesThePiecesRate`, `SystemAudioCaptureTests.anInFlightBufferKeepsItsRateAcrossAnOutputChange`,
`NativeCaptureBindingTests.nativeBuffersKeepSamplesAndRatesInDeliveryOrder`.

## S-6 A capture that cannot start fails

Fake and native: each refused starting step releases its handles in reverse order.
Native: an unavailable process object is refused before creating a tap. Evidence:
`SystemAudioCaptureTests.eachRefusedStartingStepFailsAndReleasesItsResources`, `NativeCaptureBindingTests.eachRefusedNativeStartingStepReleasesOnlyItsHandles`,
`NativeCaptureBindingTests.aPIDWithoutANativeProcessObjectIsRefused`.

## S-7 A capture the system stops fails

Fake and native: stopped devices and unreadable formats fail after cleanup;
the first failure survives a later stop. Native notifications require a matching subscription. Evidence: `SystemAudioCaptureTests.aSystemStopReportsFailure`, `NativeCaptureBindingTests.nativeStopListenerReportsOnlyStoppedDevices`, `NativeCaptureBindingTests.nativeStopNotificationsRequireMatchingSubscriptions`,
`SystemAudioCaptureTests.anUnsupportedFormatKeepsEarlierAudioAndFinishesAfterCleanup`, `NativeCaptureBindingTests.nativeFormatFailuresKeepEarlierAudio`.

## S-8 A failed capture keeps what it heard

Fake: earlier pieces and IO held across a system stop precede the error. Evidence:
`SystemAudioCaptureTests.aFailedCaptureKeepsEveryPieceItHeard`,
`SystemAudioCaptureTests.anInFlightBufferPrecedesTheSystemStopError`.

## S-9 Stopping ends the capture

Fake and native: teardown releases handles in reverse order; IO drains before completion. Real: hearing the tone stops successfully; a deadline throws a timeout. Evidence:
`SystemAudioCaptureTests.stoppingEndsAudioAndReleasesInReverseOrder`, `NativeCaptureBindingTests.nativeStopReleasesEveryHandleInReverseOrder`,
`SystemAudioCaptureTests.anIntentionalStopNotificationDoesNotFailTheStream`,
`SystemAudioCaptureTests.anInFlightBufferPrecedesAnExplicitStopInOrder`,
`SystemAudioCaptureTests.anExplicitStopReadsTheBufferAlreadyInFlight`,
`SystemAudioCaptureTests.releasingTheLastOwnerDuringIOFinishesCleanupAndAudio`,
`SystemAudioCaptureTests.cancellingTheReaderReleasesTheCaptureResources`,
`CoreAudioBindingTests.realCaptureStopsAndEndsItsAudio`.

## S-10 A capture can follow a stopped one

Fake and real: a second capture hears its tone after the first ends. Evidence:
`SystemAudioCaptureTests.anotherCaptureCanFollowAStoppedOne`,
`CoreAudioBindingTests.realCaptureCanFollowAStoppedCapture`.

## S-11 A capture that heard nothing ends cleanly

Fake: stopping without delivery ends without pieces or failure. Evidence: `SystemAudioCaptureTests.aCaptureThatHeardNothingEndsCleanly`.

## S-12 A process I did not name is left out

Fake: every excluded tone is absent at start and after rename. Evidence:
`SystemAudioCaptureTests.anUnnamedProcessIsLeftOut`,
`SystemAudioCaptureTests.severalProcessesAreSelectedAtStartAndOnRenaming`,
`NativeCaptureBindingTests.nativeTapDescriptionTranslatesEveryProcess`.

## S-13 A process I left out is not heard

Fake: every excluded tone under "all but" is absent at start and after rename.
Evidence: `SystemAudioCaptureTests.anExcludedProcessIsNotHeard`,
`SystemAudioCaptureTests.severalProcessesAreSelectedAtStartAndOnRenaming`,
`NativeCaptureBindingTests.nativeTapDescriptionTranslatesEveryProcess`.

## S-14 A process that starts later is heard

Fake: a later process under "all but" is heard. Evidence: `SystemAudioCaptureTests.aProcessStartingLaterIsHeard`.

## S-15 A naming the system refuses keeps the old one

Fake: refused naming retains the old tone. Native: a refused description write
throws. Evidence: `SystemAudioCaptureTests.aRefusedNamingKeepsTheFirstNaming`,
`NativeCaptureBindingTests.aRefusedNativeDescriptionWriteIsThrown`.

## S-17 Sound is read without muting it

Fake and native: the unmuted request retains the named tone. Evidence:
`SystemAudioCaptureTests.aNamedProcessIsHeardWithoutMutingPlayback`,
`NativeCaptureBindingTests.nativeTapDescriptionTranslatesEveryProcess`.
Real: pending the user's Zoom call with audible far-side playback.
