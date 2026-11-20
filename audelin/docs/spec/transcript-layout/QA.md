# Transcript layout — QA

Driven directly through TranscriptLayout with caller-owned storage, reading
back its rows, anchors and locations. Evidence names are in TranscriptLayoutTests.

## S-1 Both speakers settle in call order
Evidence: `TranscriptLayoutTests.callOrderGivesEachSpeakerItsOwnRow`, `TranscriptLayoutTests.settlingKeepsIDsTimesAndOrder`.

## S-2 Recovered speech belongs where it was said
Evidence: `TranscriptLayoutTests.consecutiveLateEntriesGroupInCallOrder`.

## S-3 A gap sits where the side went missing
Evidence: `TranscriptLayoutTests.gapsSplitLateGroupsAtTheirTime`, `TranscriptLayoutTests.lateTextKeepsTheGapAtItsTime`.

## S-4 A reused speech slot belongs at its new time
Evidence: `TranscriptLayoutTests.reusedSlotGetsAFreshTimeAndID`.
