# Live text — QA

Live text is no adapter: every row drives it through a fake recogniser and a
fake audio source, and reads the segments it publishes.

## S-1 Words appear while they are spoken

The fake recogniser reports two words, neither final. Evidence:
`LiveTextTests.wordsAppearWhileTheyAreSpoken`.

## S-2 Pending words change in place

The fake recogniser reports two pending words, then the same span heard as
three other words. Evidence:
`LiveTextTests.pendingWordsChangeInPlace`.

## S-3 Words settle

The fake recogniser reports pending words, then marks the track final past
them. Evidence:
`LiveTextTests.wordsSettle`.

## S-4 Settled words never change

After words settle, the fake recogniser reports other words over the same
times. Evidence:
`LiveTextTests.settledWordsNeverChange`.

## S-5 A pause starts a new segment

The fake recogniser reports pending words, then words starting 2 s after
the last one ended; and settled words with a pause between them, then one
word more. Evidence:
`LiveTextTests.aPauseStartsANewSegment`,
`LiveTextTests.aPauseBetweenSettledWordsStays`.

## S-11 Words before a pause settle only when final

The fake recogniser reports pending words, words after a pause, then marks
the track final through the words before the pause. Evidence:
`LiveTextTests.wordsBeforeAPauseSettleOnlyWhenFinal`.

## S-12 A pause no longer heard is gone

The fake recogniser reports two pending words with a pause between them,
then the same words without it. Evidence:
`LiveTextTests.aPauseNoLongerHeardIsGone`.

## S-6 Speech without a pause stays one segment while it is short

The fake recogniser reports words, then words starting just under 2 s after
the last one ended; and three words, then one just under 2 s later.
Evidence:
`LiveTextTests.speechWithoutAPauseStaysOneSegment`,
`LiveTextTests.aGapShorterThanAPauseKeepsThreeWordsTogether`.

## S-7 Stopping keeps the text so far

With pending words reported, the client stops Live text; the fake
recogniser finishes with one word more. Evidence:
`LiveTextTests.stoppingKeepsTheTextSoFar`.

## S-8 A failed recogniser keeps the text so far

With pending words reported, the fake recogniser throws. Evidence:
`LiveTextTests.aFailedRecogniserKeepsTheTextSoFar`.

## S-9 The end of the audio keeps the text so far

With pending words reported, the fake audio source ends; the fake
recogniser finishes with one word more. Evidence:
`LiveTextTests.theEndOfTheAudioKeepsTheTextSoFar`.

## S-10 Pending words no longer heard are gone

With one word settled and one pending, the fake recogniser reports no words
from the pending word's start; and a pending word after a pause, so a
whole segment goes. Evidence:
`LiveTextTests.pendingWordsNoLongerHeardAreGone`,
`LiveTextTests.aPendingSegmentNoLongerHeardIsGone`.

## S-13 A long segment ends at a sentence end

The fake recogniser settles words over 20 s with a sentence end at 10 s and
one at 16 s, all without a pause. Evidence:
`LiveTextTests.aLongSegmentEndsAtASentenceEnd`.

## S-14 A segment with no sentence end ends at 30 s

The fake recogniser settles words over 40 s with no sentence end and no
pause. Evidence:
`LiveTextTests.aSegmentWithNoSentenceEndEndsAt30s`.

## S-15 Length cuts wait for settled words

The fake recogniser reports words past 15 s with a sentence end, pending,
then settles them. Evidence:
`LiveTextTests.lengthCutsWaitForSettledWords`.

## S-16 A short fragment before a pause joins the next words

The fake recogniser reports one word, a pause, then a sentence; and two
words ending a sentence, a pause, then more. Evidence:
`LiveTextTests.aShortFragmentBeforeAPauseJoinsTheNextWords`,
`LiveTextTests.aShortFragmentJoinsTheNextWordsAfterALongSilence`,
`LiveTextTests.aShortFragmentAfterASentenceJoinsTheNextWords`,
`LiveTextTests.aShortSentenceBeforeAPauseStaysItsOwnSegment`.
