# Parakeet recogniser — QA

The windowing is driven through a fake of the Parakeet binding that replays
the windows recorded from Parakeet v3 in research run 5, with silence of the
recording's length as the audio. The binding itself runs for real, over
speech the system's Russian voice reads into a temp file.

## S-1 Nothing is heard before a window's audio is in

Audio up to just short of the first window's end. Evidence:
`ParakeetRecognizerTests.nothingIsHeardBeforeAWindowsAudioIsIn`.

## S-2 Words before the right context are final

The second recorded window: the words ending by its chunk's end are final.
Evidence:
`ParakeetRecognizerTests.wordsBeforeTheRightContextAreFinal`.

## S-3 Words in the right context are pending

The first recorded window: the words after its chunk's end are reported and
not final. Evidence:
`ParakeetRecognizerTests.wordsInTheRightContextArePending`.

## S-4 The next window reads pending words anew

The second recorded window replaces the first window's right-context words
with its own reading, in track time. Evidence:
`ParakeetRecognizerTests.theNextWindowReadsPendingWordsAnew`,
`ParakeetRecognizerTests.reportsAreInTrackTime`.

## S-5 A pending word the next window does not hear is gone

Through Live text: a fake window reads a word in its right context; the
next fake window reads none there. Evidence:
`ParakeetRecognizerTests.aPendingWordTheNextWindowDoesNotHearIsGone`.

## S-6 Words two windows read are heard once

The whole recording through Live text: no word settles twice, and every
word a window's chunk holds settles. Evidence:
`ParakeetRecognizerTests.wordsTwoWindowsReadAreHeardOnce`.

## S-7 A word no later window reads is final

A fake window's word starts before the next window does and ends past
that window's chunk; through Live text, a pending word in the next
window's right context stays pending until a third window reads it anew.
Evidence: `ParakeetRecognizerTests.aWordNoLaterWindowReadsIsFinal`,
`ParakeetRecognizerTests.aFinalWordStretchedPastTheNextWindowLeavesItsWordsPending`.

## S-8 Finishing hears the rest

Audio stopping mid-chunk; finishing reports the remaining windows' words,
all final; each window carries the track's own samples. Parakeet v3 for
real over a track shorter than its shortest window. Evidence:
`ParakeetRecognizerTests.finishingHearsTheRest`,
`ParakeetRecognizerTests.windowsCarryTheTracksAudio`,
`ParakeetRecognizerTests.aTrackShorterThanTheModelTakesIsHeard`.

## S-9 Audio at another sample rate is heard

Parakeet v3 for real over the system voice reading a Russian sentence at
48 kHz, heard through Live text word for word; its windows are cut as at
16 kHz. Evidence:
`ParakeetRecognizerTests.audioAtAnotherSampleRateIsHeard`,
`ParakeetRecognizerTests.audioAtAnotherSampleRateIsCutIntoTheSameWindows`.

## S-10 A failing model fails the recogniser

The fake binding throws on a window. Evidence:
`ParakeetRecognizerTests.aFailingModelFailsTheRecogniser`.
