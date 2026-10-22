# System audio capture

Observer: the recorder of a call, which reads the call's side through Live
text's `AudioSource` as the «они» track. The recorder has no spec yet; its
needs come from the user spec (S-1 to S-3, S-9), mvp.md's technical rules
1–3 and Screen 8's "No call audio". The capture taps the processes that
[call app processes](../call-app-processes/SPEC.md) chooses.

## Decided

- A Core Audio process tap, as Amanu ([research](../../research/system-audio.md)).
  It needs only the system-audio permission. Echo cancellation anywhere in
  the process kills a tap (MacParakeet), so Audelin never turns it on.
- The tap asks for a mono mixdown at the device's rate (anarlog, Meetily).
  mvp.md keeps the call as one channel of its file and `AudioChunk` is one
  channel; rule 3's 16 kHz conversion stays before ASR. No mixing, gain or
  filtering of Audelin's own.
- The capture starts its device itself, not by tap auto-start (Muesli's fix
  for #600): a recording started by hand can begin before the call, the
  case where Muesli's tap froze Zoom.
- Playback stays as it was (Amanu). A new choice re-points the running tap,
  and a refused one keeps the old tap. On macOS 26 the tap names the app's
  bundle ids and follows it across a relaunch (Amanu).
- Track time is call time, an Audelin decision: the two tracks' lines are
  ordered by time and sit side by side in mvp.md's file. The track starts
  with the capture, and any stretch the tap skips is filled with silence by
  its timestamps, which only the capture sees. Amanu instead offsets the
  whole track by its first buffer.
- A quiet tap is not a failure: a tap can stop delivering while nothing
  plays (Muesli). The capture fails when a step of starting it fails, or
  when the system stops its device.
- No rebuild here; the recorder may start a new capture. Amanu has no
  restart (a gap it names); Muesli retries after 2 s and 5 s.
- A denied permission gives silence, not a failure (Amanu, Meetily).

```gherkin
Feature: Hearing the call's side

  Scenario: S-1 The chosen processes' sound is heard
    Given a capture for a running call app
    When the call app plays the far side
    Then I can read what it played

  Scenario: S-2 A helper the call app opens later is heard
    Given a capture for a running call app
    When the far side comes from a helper the call app opened later
    Then I can read what it played, in the same track

  Scenario: S-3 Sound keeps its time after a quiet start
    Given a capture that has heard nothing yet
    When the call app plays
    Then I can read its sound where it falls in call time

  Scenario: S-4 Sound keeps its time after a quiet stretch
    Given a capture that heard the call, then nothing for a while
    When the call app plays again
    Then I can read its sound where it falls in call time

  Scenario: S-5 A new output device keeps the call heard
    Given a capture for a running call app
    When the user switches to another output device
    Then I can read the call's sound at the new device's rate

  Scenario: S-6 A capture that cannot start fails
    Given the system will not let the capture start
    When the recorder starts it
    Then I can tell the capture failed

  Scenario: S-7 A capture the system stops fails
    Given a capture for a running call app
    When the system stops it mid-call
    Then I can tell the capture failed

  Scenario: S-8 A failed capture keeps what it heard
    Given a capture that heard the call
    When it fails
    Then I can read everything it heard before

  Scenario: S-9 Stopping ends the track
    Given a capture for a running call app
    When the recorder stops it
    Then I can read the end of the audio

  Scenario: S-10 A capture can follow a stopped one
    Given a capture the recorder stopped
    When the recorder starts another
    Then I can read the call through the new one

  Scenario: S-11 A capture that heard nothing ends cleanly
    Given a capture that has heard nothing
    When the recorder stops it
    Then I can read the end of the audio
```

Not system audio capture's: naming the call app (call detection), proving
the permission by a sound heard back (setup), writing the track, retrying
a failed capture, stopping on sleep and recording through a recognition
failure or load (the recorder, which reads capture apart from recognition),
the missing-audio banner (the panel), a recogniser fed a changing rate, and
the microphone.
