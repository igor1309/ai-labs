# Previous transcript — QA

Rows drive the built app by a checked-in live scenario on fixture calls
with a current transcript, with or without a previous one, some without
origin, and notes made from one of them, and read the files in the call's
folder back. A fake notes provider records every request.

## S-1 The replaced transcript is kept beside

Re-recognize a fixture whose transcript has no origin: the previous file is byte-identical to the old transcript, with no origin added.
Evidence: Missing.

## S-2 Restoring the previous transcript

Restore: the files have swapped at once and after relaunch; the notes are unchanged; the provider got no request.
Evidence: Missing.

## S-3 A failed restore

Fail the swap after it begins: the reason shows; both files are byte-identical to before. Kill the app during the swap and relaunch: the pair is wholly old or wholly new.
Evidence: Missing.

## S-4 Only one previous transcript is kept

Re-recognize a call that has a previous transcript: the folder holds the newest and the replaced one only.
Evidence: Missing.

## S-5 A call never made again

A call never re-recognized: the row menu has no restore item.
Evidence: Missing.

## S-6 Replacing keeps the notes

Re-recognize a call with notes: the notes are unchanged; the provider got no request.
Evidence: Missing.

## S-7 Notes from a transcript not current say so

Notes made from the now-previous transcript: the mark shows; making them again sends the current transcript to the provider, and the new notes show no mark.
Evidence: Missing.

## S-8 Notes from the current transcript say nothing

Notes made from the current transcript, and in a second run notes whose transcript was restored: no mark shows.
Evidence: Missing.

## S-9 Older notes after a replacement

Notes from before this feature: no mark before; after a re-recognition the mark shows.
Evidence: Missing.

## S-10 Older notes after a restore

Notes from before this feature, marked after a re-recognition, then restore: the mark still shows; make them again and it goes.
Evidence: Missing.

## S-11 Each set of notes has its own mark

Previous notes from the now-previous transcript and Current notes from the current one: switching shows the mark on Previous only.
Evidence: Missing.
