# Transcript file — QA

An adapter over a file, so every row runs against real files in a fresh
temporary folder, never the user's own. Text is written as numbered
lines and read from outside the adapter, so a read proves which text came
back. Where the file system will not fail on cue, a row runs through a
fake of the file binding. The user spec's real call proves the whole path.

## S-16 An opened transcript holds its first text

Open with a numbered text and close with no write; the file holds it. A
composition row: a recording with live text off, stopped with no text,
leaves a transcript that says no text was heard.
Evidence: `TranscriptFileTests.openedWithoutWritesKeepsInitialBytes()` and `SessionTranscriptTests.liveTextOffLeavesTheNoTextTranscriptAfterStopping()`.

## S-4 A closed transcript keeps the last text

Three writes, then close; the file holds the third write's text.
Evidence: `TranscriptFileTests.closeKeepsThirdWriteAndEndsWriting()`.

## S-20 A closed transcript takes no more writes

After S-4's close a fourth write fails and the file is unchanged.
Evidence: `TranscriptFileTests.closeKeepsThirdWriteAndEndsWriting()`.

## S-6 A crash before a replacement lands keeps the last text

A helper process opens a transcript through a binding that pauses a
chosen write after writing beside the file and before renaming, and says
so; it writes numbered texts, reports each once its write returns, and is
killed with SIGKILL while paused. The file read independently holds
exactly the last reported text, whole, and a later open at another place
in the folder is not tripped by the left temporary. Evidence: `TranscriptFileCrashTests.sigkillAtRenameKeepsExactlyOneWholeTranscript(point:)`.

## S-18 A crash after a replacement lands keeps the new text

A second run of S-6 pauses after the rename; the file holds the new text
whole. Evidence: `TranscriptFileCrashTests.sigkillAtRenameKeepsExactlyOneWholeTranscript(point:)`.

## S-7 A transcript that cannot be opened fails

Opening in a folder that does not exist, and in one without write
permission, fails and leaves no file. Through the binding fake, creation
succeeds and its first sync fails; the open fails, no file is left, and a
second open at the same place succeeds. Evidence: `TranscriptFileTests.missingAndUnwritableFoldersLeaveNoFile()` and `TranscriptFileTests.failedInitializationRemovesCreationAndAllowsRetry(fault:)`.

## S-8 A transcript never overwrites a file

A file, and a symlink to a file, already at the place; the open fails and
both are byte for byte unchanged. Evidence: `TranscriptFileTests.existingFilesAndSymlinksRemainUnchanged()`.

## S-9 A failed write is told and keeps the last text

Through the binding fake, a write fails at each step: writing beside,
flushing, renaming. Each fails the write, the file holds the last text
whose write returned, and no temporary file is left. Evidence: `TranscriptFileTests.failedReplacementKeepsLastTextCleansTemporaryAndAllowsRetry(fault:)`.

## S-10 A write after a failed one works

After each failure of S-9 and S-14, the next write returns and holds its
text whole. After a rewrite, a write telling no final text, as compose
sends after a failed rendering, replaces the file whole. A composition
row fails one rendering and finds the next write replaces the file whole.
Evidence: `TranscriptFileTests.failedReplacementKeepsLastTextCleansTemporaryAndAllowsRetry(fault:)`, `TranscriptFileTests.failedRewriteKeepsFinalEntriesAndTheNextWriteReplacesTheFileWhole(fault:)`, `TranscriptFileTests.noFinalLengthReplacesWholeAndForgetsTheKeptPrefix()` and `TranscriptRenderingTests.aWriteThatFailsToRenderMakesTheNextWriteReplaceTheFileWhole()`.

## S-12 Final text stays and only what follows is written

Text with a final part and a changing one is written, which replaces the
file whole; the changing part then grows, more becomes final, and more is
added. Each later write opens the file, cuts it, writes and flushes, never
creating or renaming; the bytes written are the text after the final part
alone, and each read holds the whole text.
Evidence: `TranscriptFileTests.finalEntriesStayOnDiskAndOnlyTheTextAfterThemIsWritten()`.

## S-13 A crash while rewriting keeps the final text

The helper of S-6 writes a final part and a changing one three times
and pauses the third write once the file is cut back, and is killed with
SIGKILL there; the file holds exactly the final text, and no temporary. Evidence: `TranscriptFileCrashTests.sigkillWhileRewritingKeepsEveryFinalEntryWhole(point:)`.

## S-19 A crash before a rewrite is flushed keeps its text

S-13 paused once the rest is written, before the flush: the file holds
the third text whole. Evidence: `TranscriptFileCrashTests.sigkillWhileRewritingKeepsEveryFinalEntryWhole(point:)`.

## S-14 A failed rewrite keeps the final text

Through the binding fake, a rewrite fails at each step: opening, cutting
back, writing (after part of the text is on disk), flushing. Each fails
the write; the file holds the whole final text followed by exactly what
reached it: the old text, part of the new, or all of it. The next write
replaces the file whole and holds its text (S-10).
Evidence: `TranscriptFileTests.failedRewriteKeepsFinalEntriesAndTheNextWriteReplacesTheFileWhole(fault:)`.

## S-15 A closed transcript is replaced whole

Text is written and the transcript closed; replacing it with another
numbered text returns, and the file holds the new text whole, through a
write beside it and a rename. S-9's faults, run on a closed transcript,
each keep the old text whole.
Evidence: `TranscriptFileTests.closedTranscriptCanBeReplacedWhole()` and `TranscriptFileTests.failedClosedReplacementKeepsLastTextAndAllowsRetry(fault:)`.
