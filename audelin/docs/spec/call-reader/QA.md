# Call reader QA

Driven for real on transcripts Audelin wrote, copied into a temp calls
folder; never the user's own. Fixtures span gaps, speaker names, text
filled in late and a revised tail.

## S-1 With no call recording there is no live call
Drive: a temp folder with two finished transcripts and one old one with no origin; read none. Evidence: `TestS1_WithNoCallRecordingThereIsNoLiveCall` in `audelin/feed/callreader`, run by `audelin-feed-core`.

## S-2 The call being recorded is the live call
Drive: a transcript saved mid-call in a renamed folder with copied dates, and one saved with live text off, beside an older finished one; the start is the name's time; read back each part's side, start and words against the file. Evidence: `TestS2_TheCallBeingRecordedIsTheLiveCall`, `TestReadsEachPartsSpeakerStartAndWords`, `TestACallWithLiveTextOffIsLiveWithNoParts` in `audelin/feed/callreader`, run by `audelin-feed-core`.

## S-3 Text added since is read
Drive: replace the transcript with Audelin's next save of it, its tail revised; read the new parts and the tail as the file shows it. Evidence: `TestS3_NewTextOfTheFollowedCallIsRead`, `TestReadsTheTailAsTheFileShowsIt` in `audelin/feed/callreader`, run by `audelin-feed-core`.

## S-4 A finished call has ended
Drive: beside an older unfinished transcript, replace the live one with a version telling one finishing stage; read that it ended, not the older call. Evidence: `TestS4_AFinishingStageToldEndsTheCall` in `audelin/feed/callreader`, run by `audelin-feed-core`.

## S-5 A transcript that cannot be opened is said
Drive: make the live transcript unreadable by permissions; read the failure. Evidence: `TestS5_AVanishedTranscriptIsAFailedRead`, `TestS5_AVanishedFolderIsAFailedRead`, `TestS5_AnUnreadableTranscriptIsAFailedRead` in `audelin/feed/callreader`, run by `audelin-feed-core`.

## S-6 A transcript that cannot be understood is said
Drive: cut the live transcript mid front matter; read the failure. Evidence: `TestS6_AMalformedTranscriptIsAFailedRead`, `TestTextNotAsAudelinWritesItIsRefused` in `audelin/feed/callreader`, run by `audelin-feed-core`.

## S-7 The call found is read until it ends
Drive: while reading one call, add a newer live one; the first call's next save is read, then its finish. Evidence: `TestS7_ANewerCallDoesNotTakeTheFollowedOnesPlace` in `audelin/feed/callreader`, run by `audelin-feed-core`.

## S-8 A merged transcript is never live
Drive: the newest fixture is a merge Audelin wrote; read none. Evidence: `TestS8_AMergedTranscriptIsNeverLive` in `audelin/feed/callreader`, run by `audelin-feed-core`.

## S-9 The later of two calls in one minute is live
Drive: two unfinished calls, the second named with -2; read the second. Evidence: `TestS9_TheLaterOfTwoCallsInOneMinuteIsLive` in `audelin/feed/callreader`, run by `audelin-feed-core`.

## S-10 A renamed call is still read
Drive: rename the live folder with a title, then save more; the new part is read. Evidence: `TestS10_ARenamedFolderIsStillFollowed` in `audelin/feed/callreader`, run by `audelin-feed-core`.

## S-11 A half-written last line is left for later
Drive: cut the file mid-row; read the rows before it; complete it; read the row. Evidence: `TestS11_AHalfWrittenLastLineIsLeftForLater` in `audelin/feed/callreader`, run by `audelin-feed-core`.
