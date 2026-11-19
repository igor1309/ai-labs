# Transcript join — QA

Unit tests over rows of a test type carrying a marker, so pass-through is
read back exactly.

## S-1 Parts join in time order

Parts B (10:10) then A (10:00) given in that order: A's rows come first; parts with one start keep
their given order. Evidence: `TranscriptJoinTests.partsJoinInTimeOrder()`
and `partsWithTheSameStartKeepTheirGivenOrder()`.

## S-2 Rows keep their time of day

A at 10:00 with a row at 30 s, B at 10:10 with a row at 5 s: rows at 30 s
and 605 s. Evidence: `TranscriptJoinTests.rowsKeepTheirTimeOfDay()`.

## S-3 A gap says how long the call was cut off

A at 10:00 lasting 8 min, B at 10:10: one gap at 480 s lasting 120 s,
between A's rows and B's; one gap between each two parts. Evidence:
`TranscriptJoinTests.aGapSaysHowLongTheCallWasCutOff()` and
`oneGapSitsBetweenEachTwoParts()`.

## S-4 Rows pass through unchanged

Each output row equals its input row but for its time and speaker key;
markers in order. Evidence:
`TranscriptJoinTests.rowsPassThroughUnchangedButForTheirTime()`.

## S-5 Overlapping parts join with no gap

A at 10:00 lasting 12 min, B at 10:10: a gap of 0 s at 720 s. Evidence:
`TranscriptJoinTests.overlappingPartsJoinWithAGapOfNoLength()`.

## S-6 The same speaker number in two parts is two speakers

A and B each with speaker 1, named Anna and Boris: the joined rows carry
two distinct keys, and the joined names give Anna for A's and Boris for
B's; a row without a speaker keeps none. Evidence:
`TranscriptJoinTests.theSameSpeakerKeyInTwoPartsIsTwoSpeakers()`.

## S-7 Original calls are ordered by start

A part of originals at 10:00 and 10:20 with distinct opaque origins, and a
part at 10:10, given in reverse: the joined originals are 10:00, 10:10,
10:20, each origin equal to what was given. Evidence: Missing.
