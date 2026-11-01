# System audio capture — QA

Fake tests mix tones, change rate, refuse requests and hold IO. Native spies check
tap and aggregate settings, IO, listeners and teardown. Real rows use `afplay -v 0.02`
on a tone in a temp dir, run locally only (hosted CI may not tap audio).

## S-1 A named process is heard

Fake: every included tone is read live, unmuted and mono; silence before, between and after tones keeps its samples and rate. Native: PIDs become process objects with checked byte counts.
Real: the faint tone exceeds the noise floor. Evidence: `SystemAudioCaptureTests.silentBuffersBeforeBetweenAndAfterTonesReachTheStream`,
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

Fake: tones survive an output change. Native: a change during install is caught by a second read after subscribing, serialized with format notifications; IO makes no native calls. A buffer at the switch can carry the previous rate to keep native calls off IO. Input samples stay in delivery order despite different output samples. Evidence:
`SystemAudioCaptureTests.aNewOutputDeviceChangesThePiecesRate`, `SystemAudioCaptureTests.anInFlightBufferKeepsItsRateAcrossAnOutputChange`,
`NativeCaptureBindingTests.nativeBuffersKeepInputSamplesAndRatesInDeliveryOrder`, `NativeCaptureBindingTests.nativeIOCallbackMakesNoNativeCalls`, `NativeCaptureBindingTests.nativeFormatChangeDuringInstallUsesSubscribedRate`, `NativeCaptureBindingTests.nativeHeldBufferSurvivesFormatFailure`.

## S-6 A capture that cannot start fails

Fake and native: each refused starting step releases only its own handles, removing the format subscription before IO.
Native: unavailable processes, unsupported formats and refused format subscriptions fail before IO is made. Format reads check the description's byte count. A refused format or failed read after subscribing removes the listener with its original address and block. Evidence:
`SystemAudioCaptureTests.eachRefusedStartingStepFailsAndReleasesItsResources`, `NativeCaptureBindingTests.eachRefusedNativeStartingStepReleasesOnlyItsHandles`,
`NativeCaptureBindingTests.aPIDWithoutANativeProcessObjectIsRefused`, `NativeCaptureBindingTests.nativeTapFormatsAcceptOnlyFloat32MonoLittleEndian`, `NativeCaptureBindingTests.nativeInstallIOChecksFormatBeforeMakingResources`, `NativeCaptureBindingTests.nativeRefusedFormatListenerRegistrationLeavesNoIO`, `NativeCaptureBindingTests.nativeRefusedFormatDuringInstallRemovesListenerWithoutIO`, `NativeCaptureBindingTests.nativeFailedFormatReadDuringInstallRemovesListenerWithoutIO`.

## S-7 A capture the system stops fails

Fake and native: stopped devices and unreadable formats fail after cleanup;
the first failure survives a later stop. Native notifications require a matching subscription. A device that is no longer alive, a failed alive read, or abnormally stopped IO ends the capture; the alive read checks its UInt32 byte count. A running-0 notice or failed running read does not end it: Core Audio reports running 0 just after a start while the device goes on delivering audio. Evidence: `SystemAudioCaptureTests.aSystemStopReportsFailure`, `NativeCaptureBindingTests.nativeStopNotificationsReadTheirOwnDeviceState`, `NativeCaptureBindingTests.nativeRunningZeroNoticeKeepsDeliveringAudio`, `NativeCaptureBindingTests.nativeStopNotificationsRequireMatchingSubscriptions`,
`SystemAudioCaptureTests.anUnsupportedFormatKeepsEarlierAudioAndFinishesAfterCleanup`, `NativeCaptureBindingTests.nativeFormatFailuresKeepEarlierAudio`, `NativeCaptureBindingTests.nativeRefusedFormatNotificationsFailOnceAndSuppressLaterBuffers`, `NativeCaptureBindingTests.nativeFailedFormatReadNotificationFailsOnceAndSuppressesLaterBuffers`, `NativeCaptureBindingTests.nativeHeldBufferSurvivesFormatFailure`.

## S-8 A failed capture keeps what it heard

Fake: earlier pieces and IO held across a system stop precede the error. Native: a buffer copied before a format failure survives it, and later buffers are suppressed. Evidence:
`SystemAudioCaptureTests.aFailedCaptureKeepsEveryPieceItHeard`,
`SystemAudioCaptureTests.anInFlightBufferPrecedesTheSystemStopError`,
`NativeCaptureBindingTests.nativeHeldBufferSurvivesFormatFailure`.

## S-9 Stopping ends the capture

Fake and native: IO drains before completion; the format subscription is removed with its original address and block before IO, and late notifications deliver nothing. Real: hearing the tone stops successfully; a deadline throws a timeout. Evidence:
`SystemAudioCaptureTests.stoppingEndsAudioAndReleasesInReverseOrder`, `NativeCaptureBindingTests.nativeStopReleasesEveryHandleInTeardownOrder`, `NativeCaptureBindingTests.nativeFormatListenerIsRemovedBeforeIOAndIgnoresLateNotifications`,
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
`NativeCaptureBindingTests.nativeTapDescriptionTranslatesEveryProcess`. Real: pending the user spec's call.
