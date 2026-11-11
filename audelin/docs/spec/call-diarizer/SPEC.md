# Call diarizer

Observer: compose, which asks it after a call who spoke when on the call
track, to attribute the far side's text to remote speakers. It wraps
FluidAudio's two offline diarizers behind one binding; it reads the saved
track, picks the model and numbers the speakers. The microphone track is
never its input (LAB-1131).

## Decided

- **Nemotron 3 `fast128` is the default** (`../../research/diarization.md`):
  on 30 synthetic Russian group calls its speaker error is 3.8 % against
  VBx's 9.2 %, and it holds as speakers are added; on AMI 0.2 % against
  2.3 %. It is also the faster: about 11 s per hour of call.
- **VBx runs when Nemotron cannot:** when its model fails to load or its run
  fails, so a call still gets speakers from the runner-up rather than none.
- **A known speaker count above Nemotron's eight slots goes to VBx with that
  count,** since Nemotron cannot hold more. A known count of eight or fewer
  stays with Nemotron: its speaker error was lower than VBx's at two, four,
  five and six speakers and level at three (LAB-1130); seven and eight were
  not measured, and its overall lead decides them.
- **Turns are in seconds from the track's first sample,** the time base of
  the words recognised from that track.
- **Speakers are numbered from 0;** VBx's speaker names are numbered in the
  order each first speaks, so both models give compose the same shape.
- **A track with no samples has no turns** and loads no model; a track with
  no speech in it has no turns either.
- **It says which model produced the turns,** so compose can log it.

```gherkin
Feature: Telling apart the speakers on a call track

  Scenario: S-1 A call track is split into turns by Nemotron
    Given a finished call track
    When I diarize it
    Then I can read its speaker turns in seconds from the track's start, and tell Nemotron produced them

  Scenario: S-2 Nemotron failing to load falls back to VBx
    Given a finished call track and a Nemotron model that cannot be loaded
    When I diarize it
    Then I can read its speaker turns, and tell VBx produced them

  Scenario: S-3 Nemotron failing to run falls back to VBx
    Given a finished call track on which Nemotron fails
    When I diarize it
    Then I can read its speaker turns, and tell VBx produced them

  Scenario: S-4 More speakers than Nemotron holds go to VBx
    Given a finished call track with a known count of more speakers than Nemotron can hold
    When I diarize it
    Then I can read turns VBx produced for that many speakers

  Scenario: S-5 A known count Nemotron holds stays with Nemotron
    Given a finished call track with a known count of speakers Nemotron can hold
    When I diarize it
    Then I can read turns Nemotron produced

  Scenario: S-6 VBx's speakers are numbered in order of first speech
    Given a finished call track that VBx diarizes
    When I diarize it
    Then I can read its speakers numbered in the order each first spoke

  Scenario: S-7 An empty track has no turns
    Given a call track with no samples
    When I diarize it
    Then I can read that it has no turns

  Scenario: S-8 A track without speech has no turns
    Given a call track in which no one speaks
    When I diarize it
    Then I can read that it has no turns

  Scenario: S-9 Both models failing fails the pass
    Given a finished call track on which both models fail
    When I diarize it
    Then I can tell diarizing failed

  Scenario: S-10 An unreadable track fails the pass
    Given a call track that cannot be read as audio
    When I diarize it
    Then I can tell diarizing failed
```

Not the diarizer's: which segments belong to which speaker, how speakers
are labelled or shown, when the pass runs, logging, and the microphone track.
