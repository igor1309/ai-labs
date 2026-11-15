# Summary files, versions — QA

The adapter is tested for real in a temporary calls folder; disk failures
through a fake of its disk binding.

## S-1 Rotation keeps the old Current

Drive: write a pair A/B, publish C with rotation; read back Previous B and
Current C, and that A's text is gone. Evidence: `SummaryVersionsTests.rotationKeepsOnlyTheOldCurrent`.

## S-2 Rotation of a first pair

Drive: write Current A, publish B with rotation; read back A and B.
Evidence: `SummaryVersionsTests.rotationKeepsOnlyTheOldCurrent`.

## S-3 Replacement keeps only the new notes

Drive: pair A/B, publish C with replacement; read back Current C and no
Previous. Evidence: `SummaryVersionsTests.replacementKeepsOnlyNewCurrent`.

## S-4 Attribution is read back

Drive: publish made with Daily; read back the name and date. Evidence: `SummaryVersionsTests.attributionAndDatesSurviveTemplateRemovalAndRotation`.

## S-5 Attribution survives the template file

Drive: as S-4, then delete a temp Daily template file; read back Daily.
Evidence: `SummaryVersionsTests.attributionAndDatesSurviveTemplateRemovalAndRotation`.

## S-6 Older notes read as Default

Drive: write pre-template notes with and without a job receipt; read back Current, Default,
and the file bytes unchanged. Evidence: `SummaryVersionsTests.legacyNotesReadAsDefaultWithoutRewriting`.

## S-7 A failed publication keeps the pair

Drive: fake disk fails the atomic replacement; read back the pair A/B.
Evidence: `SummaryVersionsTests.failedPublicationAndDiscardKeepTheWholePair`.

## S-8 A discarded attempt keeps the pair

Drive: discard an attempt before and after publication; read back the pair A/B and no
attempt record. Evidence: `SummaryVersionsTests.failedPublicationAndDiscardKeepTheWholePair`.

## S-9 A reader during publication

Drive: hold publication immediately before and after its single atomic
replacement; read through an independent adapter; read back the old or new
pair whole. Evidence: `SummaryVersionsTests.readersSeeAWholePairAcrossTheCommit`.

## S-10 Recovery after an interrupted publication

Drive: abandon the owner before or after the atomic notes replacement,
build a new adapter on the folder; read back a whole pair and the attempt's
matching outcome. Evidence: `SummaryVersionsTests.recoveryAgreesWithTheAtomicCommit`.
