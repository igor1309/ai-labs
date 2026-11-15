# Calls storage, notes — QA

Tested for real in a temporary calls folder; ordering by handshakes on a
gated rename.

## S-1 Publication waits for a rename

Drive: hold a rename at a gate, start publication, release; read back the
notes in the new folder only. Evidence: Missing.

## S-2 A transaction's running is observable

Drive: subscribe, run a move; read back running then not. Evidence: Missing.

## S-3 Both versions move with the call

Drive: move a pair fixture to a temp target; read back both versions
through SummaryFiles at the new place. Evidence: Missing.

## S-4 A merged call starts without its parts' notes

Drive: merge two pair fixtures; read back no notes for the merged call
through SummaryFiles. Evidence: Missing.
