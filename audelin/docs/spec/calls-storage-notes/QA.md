# Calls storage, notes — QA

Tested for real in a temporary calls folder; publication requested from the rename binding.

## S-1 Publication waits for a rename

Drive: request publication inside the rename binding; await rename and
publication; read back notes in the new folder only. Evidence: `NotesVersionsTests.publicationRequestedInsideRenameUsesTheNewFolder`.

## S-2 A transaction's running is observable

Drive: subscribe, run a move; read back running then not. Evidence: `CallsTransactionTests.moveRunsThenEndsIdle`.

## S-3 Both versions move with the call

Drive: move a pair fixture to a temp target; read back both versions
through SummaryFiles at the new place. Evidence: `NotesVersionsTests.bothVersionsMoveAndRemainOneCallWithItsTranscript`.

## S-4 A merged call starts without its parts' notes

Drive: merge two pair fixtures; read back no notes for the merged call
through SummaryFiles. Evidence: `NotesVersionsTests.mergedCallHasNeitherPartsNotes`.
