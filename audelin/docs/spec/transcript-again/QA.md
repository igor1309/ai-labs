# Re-recognition — QA

Rows drive the built app by a checked-in live scenario on a temp calls
folder of fixture calls: recorded tracks with audible bleed, two far
speakers, call-app names, and a transcript whose origin names an older
build. Model loading, hearing, finishing and saving are held at handshakes
the scenario releases. Each row opens the transcript files from the
call's folder and reads them back: words, speakers, names and origin.
"Unchanged" means both files byte-identical to before the run. The user
spec's real-call drive re-recognizes one real call recorded on this Mac.

## S-1 Preparing

Hold model loading: the call shows preparing; cancel, and the files are unchanged.
Evidence: Missing.

## S-2 Hearing

Hold hearing midway: progress shows and advances when released; the old transcript opens from the folder; cancel is enabled.
Evidence: Missing.

## S-3 Finishing

Hold finishing during cleaning, and in a second run just before the swap: the call shows finishing, the old transcript opens, and cancelling leaves the files unchanged.
Evidence: Missing.

## S-4 The new transcript replaces the old

Release all: the file holds newly heard words, no bleed on the microphone side, their side split, the call-app name on the matching speaker, and this build's origin.
Evidence: Missing.

## S-5 Finishing that keeps nothing

A fixture with no bleed: the file holds the heard words and tells cleaning kept nothing; the old transcript is now previous.
Evidence: Missing.

## S-6 An ambiguous name stays unnamed

Three fixtures: a name overlapping two new speakers equally, unequally with neither mostly its own, and two names mostly on one new speaker: those speakers read unnamed. A one-to-one fixture keeps its name (S-4).
Evidence: Missing.

## S-7 Cancelling keeps the transcript

Cancel at each held wait in turn: files unchanged, no error shown.
Evidence: Missing.

## S-8 Hearing fails

An undecodable track: the reason shows, files unchanged; restore the track, retry, and the run completes.
Evidence: Missing.

## S-9 Saving fails

Fail the swap after the new file is written: the reason shows, files unchanged; retry completes.
Evidence: Missing.

## S-10 Quitting keeps the transcript

Quit at each held wait, and kill the app during the swap, then relaunch: the pair is wholly old or wholly new, nothing is being made, and no stray files are in the folder.
Evidence: Missing.

## S-11 A recording starting stops it

Start a recording during hearing, automatically and in a second run by hand: it records, files unchanged, and the call reads that making again stopped.
Evidence: Missing.

## S-12 A merged call is made again by its original calls

A merge of a merge of three fixture calls: each original call named by its start, once, in order, with new words, each gap marked, a new origin per call and the merging version.
Evidence: Missing.

## S-13 A failed original call keeps the merged transcript

The same merge with one undecodable call: files unchanged, that call and the reason show; fix it, retry, and the run completes.
Evidence: Missing.

## S-14 The speech models fail to load

Make model loading fail: the reason shows, files unchanged; let loading succeed, retry, and the run completes.
Evidence: Missing.
