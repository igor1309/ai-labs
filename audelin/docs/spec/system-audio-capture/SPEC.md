# System audio capture

Observer: the client that starts a capture of the processes it names and
reads what they play, through an interface the client owns. The capture is
an adapter: Core Audio's tap in, audio stamped with the tap's time out.

## Decided

- A Core Audio process tap: it needs only the system-audio permission, where
  ScreenCaptureKit needs screen recording ([research](../../research/system-audio.md)).
- The client names the processes to hear, or the ones to leave out; "all
  but these" also hears processes that start later. A tap description takes
  both (`CATapDescription`, Amanu `SystemAudioRecorder.swift:209`).
- The audio is the tap's own mono mix at the device's rate (anarlog,
  Meetily): the call is one channel, and 16 kHz stays before recognition.
- The tap leaves playback unmuted (Amanu `SystemAudioRecorder.swift:213`),
  so the user still hears the call.
- The capture starts its device when told to, not on its own: a tap that
  started before Zoom opened its audio froze Zoom for 60 s (Muesli #600).
- Each piece of audio carries the tap's time. Turning pieces into a track
  in call time is not the capture's (timed track).
- A quiet tap is not a failure: a tap can stop delivering while nothing
  plays (Muesli). The capture fails when starting fails or when the system
  stops its device; a denied permission gives silence, not a failure.

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
```

S-3 and S-4 moved to timed track. Not system audio capture's: which
processes carry the call (call app processes), listing them (audio
processes), call time (timed track), when to name again and retrying (the
client and the root), keeping echo cancellation out of the process, which
kills a tap (MacParakeet; the root), proving the permission (setup), and
writing the track.
