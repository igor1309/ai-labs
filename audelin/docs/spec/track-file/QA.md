# Track file — QA

An adapter over a file, so every row runs against real files in a fresh
temporary folder, never the user's own. Audio is written as numbered
tones, so a read-back proves which audio came back and where: a row reads
the samples or plays the file, never just checks that a call was made.
"Plays" means `AVAudioFile` opens the file for reading and `afinfo` reads
its length, both outside the adapter. Where the file system will not fail
on cue, a row runs through a fake of the file binding, as spec-process
allows. The real call of the user spec
(LAB-408) proves the whole path.

## S-1 Written audio can be read back

Three numbered tones are written; each stretch read back by its time holds
its own tone's samples, within 16-bit rounding. Evidence: `numberedTonesReadBackByTrackTime`.

## S-2 A stretch is read once it is written

A read of a stretch past the end is started first and is still waiting;
the tone of that stretch is written, and the read returns it. Evidence:
`unwrittenStretchWaitsForItsTone`.

## S-3 A read I stop waiting for ends

A read of an unwritten stretch is started, then its task is cancelled; it
ends with no audio, and a later read of the same stretch still works once
written. Evidence: `cancelledReadEndsWithoutAudioAndDoesNotConsumeTheStretch`.

## S-4 Audio at another rate is kept at the track's rate

A tone at 24 kHz, then one at 44.1 kHz, is written; each reads back at
48 kHz with its duration kept and its frequency in place. Evidence:
`otherRatesKeepDurationAndFrequency` and
`successiveVariableChunksKeepDurationAndContinuousAudio`, which writes
variable chunks at each converted rate and checks audio through their boundaries.

## S-5 A closed track plays

The track is closed; `AVAudioFile` and `afinfo` read the whole length and
every tone in order. Evidence: `closedFilePlaysEveryToneInOrder`.

## S-6 A read past the end ends with the track

A read past the written end is started and is still waiting; the track is
closed, and the read returns the written tail at once and nothing beyond
it. A read started after the close does the same without waiting.
Evidence: `closingReleasesWaitingReadWithOnlyTheWrittenTail`.

## S-7 A track left open by a crash keeps its audio

A helper process opens a track at native and converted rates, writes numbered tones, and reports each
tone's number once its write returns; it is killed with SIGKILL without
closing. The file plays and holds every reported tone, in order and
intact, followed by none, part or all of the next tone, whose samples
are that tone's. Evidence: `sigkillKeepsEveryAcknowledgedTone`.

## S-8 A track that cannot be opened fails

Opening in a folder that does not exist, and in one without write
permission, fails and leaves no file. Through the binding fake, creation
succeeds and writing the header then fails; the open fails, no file is
left, and a second open at the same place succeeds. Evidence: `missingAndUnwritableFoldersLeaveNoFile` and `headerFailureRemovesOnlyItsCreationAndAllowsRetry`.

## S-9 A track never overwrites a file

A file is put at the place first; opening fails, and the file's bytes are
unchanged. Evidence: `existingFileAndSymlinkAreNeverOverwritten`.

## S-10 A failed write is told and keeps what was written

The track is on a small disk image that fills up while writing, with a
read waiting past the end. The write fails, later writes are refused, the
waiting read returns the written tail, every tone whose write returned
reads back through the track at its place, and the file plays them in
order and intact. Conversion failure and a later failed converted write also
keep the full acknowledged duration; a partial replacement restores the
acknowledged tail. Evidence: `diskFullEndsWritingAndPreservesAcknowledgedTones`,
`conversionFailureKeepsAcknowledgedAudioAndEndsWaitingReads`,
`laterFailedWriteKeepsTheWholeConvertedSecond` and
`partialConvertedReplacementRestoresAcknowledgedAudio`.

## S-11 A read that cannot be made fails

Through the binding fake, a read of a written stretch fails on cue; the
read fails instead of giving audio, and a later read that the fake allows
succeeds. Evidence: `readFailureIsReportedAndCanBeRetried`.

## S-12 A failed close is told and keeps what was written

Through a positioned-write fake, writing the final length fails after each
prefix of its eight bytes on close; the header returns to its open length, the
close fails, and the file still plays every tone written, read to its end
as a file left open. Evidence: `failedFinalLengthLeavesOpenFilePlayableAndEndsWaitingReads`.

The disk-image harness is also cancelled immediately after mounting and
during its body. Detach runs without cancellation and completes before the
temporary folder is removed. Evidence: `cancellationAwaitsDetachBeforeRemovingFolder`.
