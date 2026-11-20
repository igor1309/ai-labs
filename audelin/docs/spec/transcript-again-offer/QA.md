# Re-recognition offer — QA

The evidence combines the live driver on temporary fixture calls, app
composition, and the component tests named for each rule. Live scenarios
read the saved transcript pair and notes back and observe provider requests.

## S-1 A kept call offers it

A fixture with both tracks, Audelin idle: the item is enabled, after Переименовать.
Evidence: `live-calls-transcript-again.sh` opens A's enabled item. `CallsListTranscriptAgainTests.S1_S3_S4_menuDrawsAsItsReference` proves the menu placement.

## S-2 One track missing

A fixture missing its call track: the item is disabled, naming that track.
Evidence: `live-calls-transcript-again.sh` checks B's disabled item and missing-microphone reason; `RecordingsTranscriptAgainOfferTests.S2_missingCallTrackNamesTheCallAndTrack` covers a missing call track.

## S-3 All audio missing

A fixture with no tracks: the item is disabled, saying the audio is missing.
Evidence: `RecordingsTranscriptAgainOfferTests.S3_missingAllAudioNamesBothTracks`; `CallsListTranscriptAgainTests.S2_disabledRunExplainsTheSuppliedReason` checks accessibility of the supplied reason.

## S-4 An original call missing audio

A merged fixture whose second call lacks its microphone track: disabled, naming that call and track.
Evidence: `TranscriptAgainCompositionTests.nestedOriginalsKeepTheirOffsetsAndListingMetadata`, missing-track case, checks the nested original and microphone reason through the app.

## S-5 Audelin busy

Four runs: recording, notes being made, a calls-folder move, a held restore: the item is disabled with each reason.
Evidence: `live-calls-transcript-again.sh` holds notes and reads the disabled reason; `RecordingsTranscriptAgainOfferTests.everyOtherActionBlocksRunAndRestoreOffers` covers recording, folder move and restore admission.

## S-6 Renaming the call being made again

During a held run, rename that call: refused with the reason; its name is unchanged.
Evidence: `RecordingsTranscriptAgainOfferTests.S8_runsOwnCallCannotBeRenamed` checks refusal, unchanged calls and the reason; `CallsTranscriptAgainTests.waitsBelongToTheirCallAndOtherRowsStayUsable` checks row editability.

## S-7 Deleting the call being made again

During a held run, delete that call: refused with the reason; its folder remains.
Evidence: `RecordingsTranscriptAgainOfferTests.S12_runsOwnCallCannotBeDeleted` checks refusal and unchanged calls.

## S-8 Restoring on the call being made again

During a held run, restore that call: refused with the reason; its files are unchanged.
Evidence: `RecordingsTranscriptAgainOfferTests.S10_layoutIsLockedDuringARun` checks restore refusal with the active run's reason.

## S-9 Another call is used as usual

During a held run, rename another call: its folder carries the new name.
Evidence: `RecordingsTranscriptAgainOfferTests.S9_anotherCallStaysUsable` checks the rename effect and fresh listing through the production ports.

## S-10 Same place without notes

A fixture with notes and one without: the item is at the same index after Переименовать in both menus.
Evidence: `CallsListTranscriptAgainTests.S1_S3_S4_menuDrawsAsItsReference` covers both menu fixtures; `S10_runMenuItemSendsTheSecondRowsCall` checks the row's action.

## S-11 A merge under way

Hold a merge: the item is disabled with the reason.
Evidence: `RecordingsTranscriptAgainOfferTests.S7_runWaitsForAMerge` and `everyOtherActionBlocksRunAndRestoreOffers` check merge admission and its reason.

## S-12 Merging during a run

Hold a run, then confirm a merge: it is refused with the reason, and no folder moved.
Evidence: `RecordingsTranscriptAgainOfferTests.S10_layoutIsLockedDuringARun` checks every merge intent is refused without an effect.
