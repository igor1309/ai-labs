# Call diarizer — QA

The choice of model, the fallback and the numbering are driven through a
fake of the diarization binding: it records which model was asked for, with
which speaker count and how many samples, and returns turns or fails. The
track is a real audio file in a temp folder. The binding itself runs for
real, on the models FluidAudio downloads, over a track two of the system's
voices read in turn, one Russian and one English, into a temp file.

## S-1 A call track is split into turns by Nemotron

The fake's Nemotron returns turns; the result holds them sorted by start,
from Nemotron, and the fake received the track as 16 kHz samples. The real
binding's Nemotron gives the two voices different speakers: the speaker
covering most of the first voice's span differs from the one covering most
of the second's, and every turn lies inside the track.
Evidence: `CallDiarizerTests.aCallTrackIsSplitIntoTurnsByNemotron`,
`CallDiarizerBindingTests.nemotronFindsTurnsInTheTrack`.

## S-2 Nemotron failing to load falls back to VBx

The fake's VBx turns come back, from VBx. The real binding's VBx finds at
least one turn inside the two-voice track. Evidence: `CallDiarizerTests.nemotronFailingToLoadFallsBackToVBx`,
`CallDiarizerBindingTests.vbxFindsTurnsInTheTrack`.

## S-3 Nemotron failing to run falls back to VBx

Evidence: `CallDiarizerTests.nemotronFailingToRunFallsBackToVBx`.

## S-4 More speakers than Nemotron holds go to VBx

A known count of nine; the result holds the fake VBx's turns, from VBx,
and the fake records VBx asked for nine and Nemotron never loaded. Evidence: `CallDiarizerTests.moreSpeakersThanNemotronHoldsGoToVBx`.

## S-5 A known count Nemotron holds stays with Nemotron

A known count of eight; the result holds the fake Nemotron's turns, from
Nemotron. Evidence:
`CallDiarizerTests.aKnownCountNemotronHoldsStaysWithNemotron`.

## S-6 VBx's speakers are numbered in order of first speech

VBx turns named "S3", "S1", "S3", "S2". Evidence:
`CallDiarizerTests.vbxSpeakersAreNumberedInOrderOfFirstSpeech`.

## S-7 An empty track has no turns

A WAV with no frames; the result holds no turns, and the fake records no
model asked for. Evidence:
`CallDiarizerTests.anEmptyTrackHasNoTurns`.

## S-8 A track without speech has no turns

The real binding over a second of silence, for each model. Evidence:
`CallDiarizerBindingTests.aTrackWithoutSpeechHasNoTurns`.

## S-9 Both models failing fails the pass

`diarize` throws VBx's error. Evidence: `CallDiarizerTests.bothModelsFailingFailsThePass`.

## S-10 An unreadable track fails the pass

A text file named `.wav`; `diarize` throws, and the fake records no model
asked for. Evidence:
`CallDiarizerTests.anUnreadableTrackFailsThePass`.
