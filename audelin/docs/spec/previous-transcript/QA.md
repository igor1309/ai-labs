# Previous transcript — QA

The evidence combines the live driver on temporary fixture calls, app
composition, and the component tests named for each rule. Live scenarios
read the saved transcript pair and notes back and observe provider requests.

## S-1 The replaced transcript is kept beside

Re-recognize a fixture whose transcript has no origin: the previous file is byte-identical to the old transcript, with no origin added.
Evidence: `live-calls-transcript-again.sh`: the transcript-again seed has no origin; the published previous equals its old bytes. `TranscriptAgainCompositionTests.remakeAndRestoreRefreshTheShownDetailAndKeepTheOldBytes` checks the same through composition.

## S-2 Restoring the previous transcript

Restore: the files have swapped at once and after relaunch; the notes are unchanged; the provider got no request.
Evidence: `live-calls-transcript-again.sh`, each failure/retry scenario: restore, Quit and relaunch preserve the swapped pair; the notes bytes and absence of provider requests are checked.

## S-3 A failed restore

Fail the swap after it begins: the reason shows; both files are byte-identical to before. Kill the app during the swap and relaunch: the pair is wholly old or wholly new.
Evidence: `live-calls-transcript-again.sh`, `failed-restore` and `kill-restore`; `CallsPreviousTranscriptTests.S6_aFailedRestoreLeavesThePair` and `S12_anInterruptedRestoreIsSettledAtStart` cover every disk step.

## S-4 Only one previous transcript is kept

Re-recognize a call that has a previous transcript: the folder holds the newest and the replaced one only.
Evidence: `live-calls-transcript-again.sh` starts with an older previous, publishes and checks exactly the replaced bytes beside the new transcript and no recovery files. `CallsPreviousTranscriptTests.S2_publishingDropsAnOlderPrevious` checks the complete folder listing.

## S-5 A call never made again

A call never re-recognized: the row menu has no restore item.
Evidence: `live-calls-transcript-again.sh` opens the menu of B, which has no previous; no restore item exists.

## S-6 Replacing keeps the notes

Re-recognize a call with notes: the notes are unchanged; the provider got no request.
Evidence: `live-calls-transcript-again.sh` checks unchanged notes and no provider request after transcript actions; `TranscriptAgainCompositionTests.remakeAndRestoreRefreshTheShownDetailAndKeepTheOldBytes` keeps published notes through remake and restore.

## S-7 Notes from a transcript not current say so

Notes made from the now-previous transcript: the mark shows; making them again sends the current transcript to the provider, and the new notes show no mark.
Evidence: `TranscriptAgainCompositionTests.eachNotesVersionsMarkFollowsReplacementRestoreAndRegeneration` runs known and legacy notes through replacement, optional restore, regeneration with the current words, and switching both versions. `TranscriptAgainCompositionTests.remakeAndRestoreRefreshTheShownDetailAndKeepTheOldBytes` proves the changed mark; `notesIdentityTravelsFromTextThroughJobAndFiles` proves the submitted transcript identity reaches the saved notes. `CallDetailTranscriptMarkTests.currentTranscriptNotesAreUnmarked_state` proves the new identity is unmarked.

## S-8 Notes from the current transcript say nothing

Notes made from the current transcript, and in a second run notes whose transcript was restored: no mark shows.
Evidence: `TranscriptAgainCompositionTests.eachNotesVersionsMarkFollowsReplacementRestoreAndRegeneration` runs known and legacy notes through replacement, optional restore, regeneration with the current words, and switching both versions. `TranscriptAgainCompositionTests.remakeAndRestoreRefreshTheShownDetailAndKeepTheOldBytes` checks no mark before replacement and after restoring the notes' transcript.

## S-9 Older notes after a replacement

Notes from before this feature: no mark before; after a re-recognition the mark shows.
Evidence: `TranscriptAgainCompositionTests.eachNotesVersionsMarkFollowsReplacementRestoreAndRegeneration` runs known and legacy notes through replacement, optional restore, regeneration with the current words, and switching both versions. `CallDetailTranscriptMarkTests.unknownNotesWithoutPreviousAreUnmarked_state` and `unknownNotesWithPreviousUseFormatterText_state` cover legacy identities; the production mapping preserves missing identities in `TranscriptAgainCompositionTests.eachNotesVersionAndTheCurrentTranscriptReachDetail`.

## S-10 Older notes after a restore

Notes from before this feature, marked after a re-recognition, then restore: the mark still shows; make them again and it goes.
Evidence: `TranscriptAgainCompositionTests.eachNotesVersionsMarkFollowsReplacementRestoreAndRegeneration` runs known and legacy notes through replacement, optional restore, regeneration with the current words, and switching both versions. `CallDetailTranscriptMarkTests.transcriptChangeAndRestoreRecomputeMarks_state` covers restored legacy notes remaining marked; `TranscriptAgainCompositionTests.notesIdentityTravelsFromTextThroughJobAndFiles` checks replacement notes receive a known identity.

## S-11 Each set of notes has its own mark

Previous notes from the now-previous transcript and Current notes from the current one: switching shows the mark on Previous only.
Evidence: `TranscriptAgainCompositionTests.eachNotesVersionsMarkFollowsReplacementRestoreAndRegeneration` runs known and legacy notes through replacement, optional restore, regeneration with the current words, and switching both versions. `CallDetailTranscriptMarkTests.switchingVersionsShowsTheirOwnMark_state` and `bothVersionsAreFormattedIndependently_state`; `TranscriptAgainCompositionTests.eachNotesVersionAndTheCurrentTranscriptReachDetail` checks independent identities across the production boundary.
