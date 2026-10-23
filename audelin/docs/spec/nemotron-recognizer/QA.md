# Nemotron recogniser — QA

The streaming is driven through a fake of the Nemotron binding that replies
to each feed with the tokens decoded so far, as scripted. The binding
itself runs for real, over speech the system's Russian voice reads into a
temp file.

## S-1 Nothing is heard before a chunk's audio is in

Audio up to just short of a chunk; the fake decodes nothing until a chunk is
in. Evidence:
`NemotronRecognizerTests.nothingIsHeardBeforeAChunksAudioIsIn`.

## S-2 Words are heard at their time in the track

Scripted tokens with times; the report's words carry those times, joined at
the word marker. Evidence:
`NemotronRecognizerTests.wordsAreJoinedAtTheirTimesInTheTrack`.

## S-3 A word followed by another is final

Two words decoded, the second starting after the first ends; the first
ends by the report's final time. Evidence:
`NemotronRecognizerTests.aWordFollowedByAnotherIsFinal`.

## S-4 The last word heard is pending

Two words decoded; the second ends after the report's final time.
Evidence:
`NemotronRecognizerTests.theLastWordHeardIsPending`.

## S-10 The last word is final after two quiet chunks

The scripted decoder returns the same two words, the last ending at
0.9 s, for three 1.12 s chunks: it is pending after two and final after
the third. Evidence:
`NemotronRecognizerTests.theLastWordSettlesAfterTwoQuietChunks`.

## S-5 A word that grows is read in its place

Through Live text: a chunk ends mid-word, the next adds its rest and a new
word; a word before it ends after the growing word starts. Evidence:
`NemotronRecognizerTests.aGrowingWordIsReadInItsPlaceOnce`,
`NemotronRecognizerTests.aWordEndingAfterThePendingWordStartsStaysPending`.

## S-6 A chunk with nothing new changes nothing

Through Live text: a feed whose tokens are the same as the last. Evidence:
`NemotronRecognizerTests.aChunkWithNothingNewChangesNothing`.

## S-7 Finishing hears the rest

The fake's finish adds a word; finishing reports it, all final. Evidence:
`NemotronRecognizerTests.finishingHearsTheRest`.

## S-8 Audio at another sample rate is heard

Nemotron 3.5 for real over the system voice reading a Russian sentence at
48 kHz, heard through Live text word for word, with settled and pending
words shown before the audio ends. Evidence:
`NemotronRecognizerTests.audioAtAnotherSampleRateIsHeard`.

## S-9 A failing model fails the recogniser

The fake binding throws on a feed. Evidence:
`NemotronRecognizerTests.aFailingModelFailsTheRecogniser`.
