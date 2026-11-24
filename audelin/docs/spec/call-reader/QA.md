# Call reader QA

Driven for real on transcripts Audelin wrote, copied into a temp calls
folder; never the user's own. Fixtures span gaps, speaker names, text
filled in late and a revised tail.

## S-1 With no call recording there is no live call
Drive: a temp folder with two finished transcripts and one old one with no origin; read none. Evidence: `TestS1_WithNoCallRecordingThereIsNoLiveCall` in `audelin/feed/callreader`, run by `audelin-feed-core`.

## S-2 The call being recorded is the live call
Drive: find the newest live transcript below newer finished, merged or originless transcripts. Read a renamed folder's start from its name and read each part's label, start and words. Two rows with the same label and displayed second have distinct IDs that persist when the speaker is relabeled. A call saved with live text off has no parts. Evidence: `TestS2_TheCallBeingRecordedIsTheLiveCall`, `TestS2_DiscoverySkipsNewerIneligibleTranscripts`, `TestReadsEachPartsSpeakerStartAndWords`, `TestPartIDsSurviveRelabelingAndDistinguishRowsInOneSecond` and `TestACallWithLiveTextOffIsLiveWithNoParts` in `audelin/feed/callreader`, run by `audelin-feed-core`.

## S-3 Text added since is read
Drive: replace the transcript with Audelin's next save of it and read the new parts and current tail. In the composed feed, revise a pending part across a displayed second. Repeat with a save that puts new words at the original second. The revised part keeps its identity and the new part is delivered. Evidence: `TestS3_NewTextOfTheFollowedCallIsRead` and `TestReadsTheTailAsTheFileShowsIt` in `audelin/feed/callreader`, and `TestPendingPartRetimingDoesNotResendItOrHideNewWords` in `audelin/feed/cmd/audelin-feed`, run by `audelin-feed-core`.

## S-4 A finished call has ended
Drive: beside an older unfinished transcript, replace the live one with a version telling one finishing stage; read that it ended, not the older call. Evidence: `TestS4_AFinishingStageToldEndsTheCall` in `audelin/feed/callreader`, run by `audelin-feed-core`.

## S-5 A transcript that cannot be opened is said
Drive: make the live transcript unreadable by permissions; read the failure. Evidence: `TestS5_AVanishedTranscriptIsAFailedRead`, `TestS5_AVanishedFolderIsAFailedRead`, `TestS5_AnUnreadableTranscriptIsAFailedRead` in `audelin/feed/callreader`, run by `audelin-feed-core`.

## S-6 A transcript that cannot be understood is said
Drive: read incomplete or corrupt front matter during discovery, with an older recording available. Follow a recording and read corrupt front matter or a malformed split or cleaning stage above a readable body. The reads fail, and the reader recovers once the file is repaired. Evidence: `TestS6_AMalformedTranscriptOnDiscoveryIsAFailedRead`, `TestS6_AMalformedTranscriptIsAFailedRead`, `TestS6_MalformedFinishingStagesAreFailedReads` and `TestTextNotAsAudelinWritesItIsRefused` in `audelin/feed/callreader`, run by `audelin-feed-core`.

## S-7 The call found is read until it ends
Drive: while reading one call, add a newer live one; the first call's next save is read, then its finish. Evidence: `TestS7_ANewerCallDoesNotTakeTheFollowedOnesPlace` in `audelin/feed/callreader`, run by `audelin-feed-core`.

## S-8 A merged transcript is never live
Drive: the newest fixture is a merge Audelin wrote. Read none when the older calls are finished, or read the newest eligible recording. Evidence: `TestS8_AMergedTranscriptIsNeverLive` and `TestS2_DiscoverySkipsNewerIneligibleTranscripts` in `audelin/feed/callreader`, run by `audelin-feed-core`.

## S-9 The later of two calls in one minute is live
Drive: two unfinished calls, the second named with -2; read the second. Evidence: `TestS9_TheLaterOfTwoCallsInOneMinuteIsLive` in `audelin/feed/callreader`, run by `audelin-feed-core`.

## S-10 A renamed call is still read
Drive: rename the live folder with a title, then save more; the new part is read. Evidence: `TestS10_ARenamedFolderIsStillFollowed` in `audelin/feed/callreader`, run by `audelin-feed-core`.

## S-11 A half-written last line is left for later
Drive: read the complete file, cut it mid-row, then restore it. The read of the partial file returns the rows before the cut. The restored rows keep their IDs. Evidence: `TestS11_AHalfWrittenLastLineIsLeftForLater` in `audelin/feed/callreader`, run by `audelin-feed-core`.
