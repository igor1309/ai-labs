# Bleed cleanup — QA

Bleed cleanup is no adapter: every row drives it through fakes of its three
interfaces. The cleaning fake records the recording it was given and returns
samples or fails; the hearing fake records the samples and returns words, no
words, or fails; the replacing fake records the recording and the words and
holds the transcript: the raw one until a replacement returns, then the
call side unchanged and the microphone side as the heard words, and a failed
replacement leaves it raw. Rows read the outcome cleanup returns and the
transcript the replacing fake holds. The gate's own rule is `BleedGateTests`.

## S-1 A call without bleed is kept as recorded

Microphone and call words with no shared word within 2 s. Evidence: Missing (`BleedCleanupTests.aCallWithoutBleedIsKeptAsRecorded`).

## S-2 A call with bleed has its microphone side replaced

Microphone words repeating the call side's at the same times, above 3 a
minute; the replacing fake holds the call side unchanged and the heard words.
Evidence: Missing (`BleedCleanupTests.aCallWithBleedHasItsMicrophoneSideReplaced`).

## S-3 A call of no length is kept as recorded

Bleeding words with a length of zero. Evidence: Missing (`BleedCleanupTests.aCallOfNoLengthIsKeptAsRecorded`).

## S-4 Cleaning failing keeps the raw transcript

The cleaning fake fails. Evidence: Missing (`BleedCleanupTests.cleaningFailingKeepsTheRawTranscript`).

## S-5 Hearing failing keeps the raw transcript

The hearing fake fails. Evidence: Missing (`BleedCleanupTests.hearingFailingKeepsTheRawTranscript`).

## S-6 Hearing nothing keeps the raw transcript

The hearing fake returns no words. Evidence: Missing (`BleedCleanupTests.hearingNothingKeepsTheRawTranscript`).

## S-7 Replacing failing keeps the raw transcript

The replacing fake fails after recording its call. Evidence: Missing (`BleedCleanupTests.replacingFailingKeepsTheRawTranscript`).
