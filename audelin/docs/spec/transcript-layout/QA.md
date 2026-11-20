# Transcript layout — QA

Driven today through Reading's reducer with spy formatters, reading back the
rows; the tests move with the component when it is extracted.

## S-1 Both speakers settle in call order
Evidence: `callOrderGivesEachSpeakerItsOwnRow`, `settlingKeepsIDsTimesAndOrder`.

## S-2 Recovered speech belongs where it was said
Evidence: `consecutiveLateEntriesGroupInCallOrder`.

## S-3 A gap sits where the side went missing
Evidence: `gapsSplitLateGroupsAtTheirTime`, `lateTextKeepsTheGapAtItsTime`.

## S-4 A reused speech slot belongs at its new time
Evidence: `reusedSlotGetsAFreshTimeAndID`.
