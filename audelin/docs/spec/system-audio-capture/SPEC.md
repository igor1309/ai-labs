# System audio capture

Observer: the client that captures the processes it names and reads what
they play, through an interface it owns. An adapter over a Core Audio tap.

## Decided

- A process tap, which needs no screen recording ([why](../../research/system-audio.md)).
- The client names the processes to hear, or those to leave out ("all but"
  also hears later ones); a tap takes both, and leaves playback unmuted
  (`CATapDescription`, Amanu `SystemAudioRecorder.swift:209-213`).
- The tap's mono mix at the device's rate (anarlog, Meetily). The device
  starts when told to: one started before Zoom's audio froze Zoom for 60 s
  (Muesli #600).
- A tap delivers samples without a break, zeros while nothing plays, while
  the process is frozen and after it quits (measured on this Mac,
  [system-audio.md](../../research/system-audio.md#measured-on-this-mac)),
  so a piece needs no time of its own and a quiet tap is not a failure. A
  denied permission gives silence.

```gherkin
Feature: Hearing the processes a client names

  Scenario: S-1 A named process is heard
    Given a capture of the processes I named
    When one of them plays
    Then I can read what it played

  Scenario: S-2 Newly named processes are heard in the same capture
    Given a capture of the processes I named
    When I name another process and it plays
    Then I can read what it played from the same capture

  Scenario: S-5 A new output device keeps the sound heard
    Given a capture of the processes I named
    When the user switches to another output device
    Then I can read what they play at the new device's rate

  Scenario: S-6 A capture that cannot start fails
    Given the system will not let a capture start
    When I start it
    Then I can tell it failed

  Scenario: S-7 A capture the system stops fails
    Given a capture that is running
    When the system stops it
    Then I can tell it failed

  Scenario: S-8 A failed capture keeps what it heard
    Given a capture that heard sound
    When the system stops it
    Then I can read all it heard before

  Scenario: S-9 Stopping ends the capture
    Given a capture that is running
    When I stop it
    Then I can read the end of the audio

  Scenario: S-10 A capture can follow a stopped one
    Given a capture I stopped
    When I start another
    Then I can read what the named processes play

  Scenario: S-11 A capture that heard nothing ends cleanly
    Given a capture that has heard nothing
    When I stop it
    Then I can read the end of the audio

  Scenario: S-12 A process I did not name is left out
    Given a capture of the processes I named
    When another process plays
    Then I cannot read that sound

  Scenario: S-13 A process I left out is not heard
    Given a capture of every process but the ones I left out
    When one I left out plays
    Then I cannot read that sound

  Scenario: S-14 A process that starts later is heard
    Given a capture of every process but the ones I left out
    When a process that started later plays
    Then I can read what it played

  Scenario: S-15 A naming the system refuses keeps the old one
    Given a capture of the processes I named
    When the system refuses a new naming
    Then I can still read what the first processes play

  Scenario: S-17 Sound is read without muting it
    Given a capture of the processes I named
    When one of them plays
    Then I can read its sound without muting its playback
```

S-3, S-4 and S-16 are retired: a tap leaves no gaps to time. Not
capture's: choosing and listing processes, naming again, retrying, keeping echo cancellation
(it kills a tap, MacParakeet) out of the process, the permission, the file.
