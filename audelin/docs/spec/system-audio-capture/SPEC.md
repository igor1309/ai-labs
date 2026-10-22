# System audio capture

Observer: the client that starts a capture of the processes it names and
reads what they play, through an interface the client owns. The capture is
an adapter: Core Audio's tap in, one timed track out.

## Decided

- A Core Audio process tap: it needs only the system-audio permission
  ([research](../../research/system-audio.md)). Echo cancellation anywhere
  in the process kills a tap (MacParakeet), so Audelin never turns it on.
  The tap leaves playback as it was.
- The client names the processes to hear, or the ones to leave out; "all
  but these" also hears processes that start later. The tap takes both. A
  new naming the system refuses keeps the old one.
- The track is the tap's own mono mix at the device's rate (anarlog,
  Meetily): the call is one channel, and 16 kHz stays before recognition.
- The capture starts its device when told to, not on its own: a tap that
  started before Zoom opened its audio froze Zoom for 60 s (Muesli #600).
- Track time is call time: the track starts with the capture, and what the
  tap skips is filled with silence by the tap's own timestamps, which only
  the capture sees. The client lines two tracks up by time.
- A quiet tap is not a failure: a tap can stop delivering while nothing
  plays (Muesli). The capture fails when starting fails or when the system
  stops its device; a denied permission gives silence, not a failure. A
  failed capture stays failed: retrying is a decorator at the root.

```gherkin
Feature: Hearing the processes a client names

  Scenario: S-1 A named process is heard
    Given a capture of the processes I named
    When one of them plays
    Then I can read what it played

  Scenario: S-2 A process I did not name is left out
    Given a capture of the processes I named
    When another process plays
    Then I cannot read that sound

  Scenario: S-3 A process I left out is not heard
    Given a capture of every process but the ones I left out
    When one I left out plays
    Then I cannot read that sound

  Scenario: S-4 A process that starts later is heard
    Given a capture of every process but the ones I left out
    When a process that started later plays
    Then I can read what it played

  Scenario: S-5 Newly named processes are heard in the same track
    Given a capture of the processes I named
    When I name other processes and one of them plays
    Then I can read what it played in the same track

  Scenario: S-6 Sound keeps its time after a quiet start
    Given a capture that has heard nothing yet
    When a named process plays
    Then I can read its sound where it falls in call time

  Scenario: S-7 Sound keeps its time after a quiet stretch
    Given a capture that heard sound, then nothing for a while
    When a named process plays again
    Then I can read its sound where it falls in call time

  Scenario: S-8 A new output device keeps the sound heard
    Given a capture of the processes I named
    When the user switches to another output device
    Then I can read what they play at the new device's rate

  Scenario: S-9 A capture that cannot start fails
    Given the system will not let a capture start
    When I start it
    Then I can tell it failed

  Scenario: S-10 A capture the system stops fails
    Given a capture that is running
    When the system stops it
    Then I can tell it failed

  Scenario: S-11 A failed capture keeps what it heard
    Given a capture that heard sound
    When the system stops it
    Then I can read all it heard before

  Scenario: S-12 Stopping ends the track
    Given a capture that is running
    When I stop it
    Then I can read the end of the audio

  Scenario: S-13 A capture can follow a stopped one
    Given a capture I stopped
    When I start another
    Then I can read what the named processes play
```

Not system audio capture's: which processes carry the call (call app
processes), listing the processes that play audio (audio processes), when
to name processes again and when to retry (the client and the root),
proving the permission (setup), writing the track, and the microphone.
