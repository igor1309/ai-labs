# Name carry — QA

Pure tests over timed speaker fixtures; expected pairings are written as
values.

## S-1 A mutual majority carries the name

Old "Anna" 70% on new A, A 80% under Anna: A is Anna.
Evidence: `NameCarryTests.mutualMajorityCarriesTheName`.

## S-2 An even split carries nothing

Anna 50/50 over A and B: no names.
Evidence: `NameCarryTests.evenSplitCarriesNothing`.

## S-3 An uneven split without a mutual majority carries nothing

Anna 70% on A; A 30% under Anna, 70% under Boris, Boris 80% on A: A is Boris, and Anna goes nowhere.
Evidence: `NameCarryTests.unevenSplitCarriesOnlyTheMutualMajority`.

## S-4 Two names on one speaker carry nothing

Anna and Boris each 90% on A, A 50/50 between them: A unnamed.
Evidence: `NameCarryTests.twoNamesOnOneSpeakerCarryNothing`.

## S-5 No old names carry nothing

No named old speakers: every new speaker unnamed.
Evidence: `NameCarryTests.noOldNamesCarryNothing`.
