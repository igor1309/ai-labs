# Merging calls — QA

Each row is a live test: the built app launched on a temp calls folder of
fixture calls, driven through the accessibility API by element identifier,
reading back what the app shows and what is on disk. The fixture calls are
parts cut from one recorded call, with saved transcripts and two remote
speakers in each part under the same labels. A wait the test must see is
held open by a fake collaborator until the test has read it, then
released. Every row reads Missing until its test exists.

## S-1 Merging calls into one

Select two parts, merge and confirm. The list holds one call in their
place; its transcript, in the app and on disk, holds every entry of both
parts in time order. Evidence: Missing.

## S-2 I see where the call was cut off

Between the parts' entries a gap line reads the time from the first part's
end to the second's start. Evidence: Missing.

## S-3 The merged call keeps its audio

With a part whose call track is shorter than its microphone track, both
merged tracks read back each part's samples starting together, the shorter
side padded, and their length is the sum of the parts' lengths. Evidence:
Missing.

## S-4 The merged call in the list

With an untitled earliest part and a titled later one, the row reads the
later part's title, the earliest start and the summed length. Evidence:
Missing.

## S-5 Speakers are not confused across parts

The four remote speakers read under four distinct labels; a named speaker
keeps its name. Evidence: Missing.

## S-6 Notes cover the whole call

With notes on and a fake notes service recording the transcript it is
given, that transcript holds both parts' text, and the merged call reads
the notes it returns. Evidence: Missing.

## S-7 Going back

Delete the merged call, restore the parts from the fixture Trash: each
lists, opens and reads its own transcript and notes. Evidence: Missing.

## S-8 No merge of a call whose audio cannot be read

Select a part whose tracks are unreadable and another: merge is disabled
and its reason names that part. Evidence: Missing.

## S-9 No merge while a call is recording

With a fixture recording running, merge is disabled and its reason reads
that a call is recording. Evidence: Missing.

## S-10 No merge while a transcript is being finished

With a fixture recording's finishing held open, merge is disabled and its
reason reads so. Evidence: Missing.

## S-11 No merge while notes are being made

With the fake notes service held open on a third call, merge is disabled
and its reason reads that notes are being made. Evidence: Missing.

## S-12 No merge of a call without a transcript

Select a call without a transcript and a part: merge is disabled and its
reason names that call. Evidence: Missing.

## S-13 No merge of overlapping calls

Select two fixture calls that overlap: merge is disabled with its reason.
Evidence: Missing.

## S-14 Merging takes a moment

With writing the merged call held open, the app reads that calls are being
merged; released, the merged call appears. Evidence: Missing.

## S-15 A merge that fails before it is made

With writing the merged transcript failing, both parts list and read as
before, no merged call is listed or on disk, and the failure reads why.
Evidence: Missing.

## S-16 A part that cannot be moved to the Trash

With trashing the second part failing, the merged call lists and reads,
the second part still lists, and the app names it with why. Evidence:
Missing.

## S-17 Audelin quits during a merge

Quit the app while writing the merged call is held open, and again while
trashing the second part is held open. Reopened, every call not in the
Trash lists and reads, no partial merged call lists or is on disk, and
after the second quit the merged call lists whole. Evidence: Missing.

## A call that starts during a merge

With merging held open, a fixture call starts with distinct sound: its
saved tracks read back that sound from its start, and the merge completes.
This row checks user `../SPEC.md` S-1 during a merge. Evidence: Missing.
