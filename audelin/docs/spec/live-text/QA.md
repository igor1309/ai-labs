# Live text — QA

Live text is a Core: every row drives it through a fake recogniser and a
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
the last one ended. Evidence:
`LiveTextTests.aPauseStartsANewSegment`.

## S-6 Speech without a pause stays one segment

The fake recogniser reports words, then words starting just under 2 s after
the last one ended. Evidence:
`LiveTextTests.speechWithoutAPauseStaysOneSegment`.

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
from the pending word's start. Evidence:
`LiveTextTests.pendingWordsNoLongerHeardAreGone`.
