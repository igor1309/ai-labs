# Microphone capture

Observer: the client that captures the user's microphone and reads what
it hears, through an interface it owns. An adapter over `AVAudioEngine`'s
input.

## Decided

- **The default input device, through the engine's input.** The live
  text preview already captures it this way (`LiveTextPreview/Audio.swift`)
  and Amanu falls back to it (`MicRoute`). Amanu first follows the
  microphone the call app listens to, because Zoom's choice can differ from
  the default; that is left for later and accepted as a gap: a user whose
  call app uses another microphone gets the default's track.
- **No voice processing.** Echo cancellation in the same process can
  silently kill the call's tap, and it muffles the user's voice
  (`research/system-audio.md`); the far side may leak in on speakers,
  which is accepted.
- **Mono at the device's rate, all channels mixed,** Audelin's own choice:
  the recognisers read mono, as from system audio capture, and an
  interface with the voice on its second channel would be silent if only
  the first were kept, as in the preview. (Amanu remaps, not mixes.)
- **A device that changes keeps the track in time.** When the engine's
  configuration changes (another app taking the mic, headphones joining)
  or the default input changes, the capture moves to the new input and the
  span it was not hearing is read as silence, so the microphone track
  stays aligned with the call's (Amanu `restartCapture`, 2026-07-28: a
  1.7 s mic track on a 19 min call without it). A gap longer than Amanu's
  `longestPad`, ten minutes, is a machine that stopped, and padding it is
  hundreds of megabytes; rather than pad less and put every later word
  early, the capture fails there, keeping all before.
- **A default input that changes is moved to only once it has held for
  1.5 s,** while the input in use keeps delivering, Amanu's `routeSettle`: a route mid-change answers differently
  from one moment to the next, and every move costs seconds.
- **A capture that cannot move to the new input fails,** keeping all it
  heard. A denied permission gives the engine's silence.

```gherkin
Feature: Hearing the user's microphone

  Scenario: S-1 The user is heard
    Given a capture of the microphone
    When the user speaks
    Then I can read what they said while the capture goes on

  Scenario: S-2 A new input device keeps the user heard
    Given a capture of the microphone
    When the user switches the system's default input
    Then I can read what they say into the new one

  Scenario: S-3 A device change keeps the track in time
    Given a capture of the microphone
    When the input changes under it
    Then I can read as much audio as the time that passed

  Scenario: S-4 A capture that cannot start fails
    Given the system will not let a capture start
    When I start it
    Then I can tell it failed

  Scenario: S-11 A gap too long to keep in time fails
    Given a capture of the microphone
    When the input is not heard for longer than can be filled
    Then I can tell it failed

  Scenario: S-5 A capture that cannot follow a change fails
    Given a capture that is running
    When the input changes and cannot be heard again
    Then I can tell it failed

  Scenario: S-6 A failed capture keeps what it heard
    Given a capture that heard the user
    When it fails
    Then I can read all it heard before

  Scenario: S-7 Stopping ends the capture
    Given a capture that has heard the user
    When I stop it
    Then I can read all it heard, then the end of the audio

  Scenario: S-8 A capture can follow a stopped one
    Given a capture I stopped
    When I start another
    Then I can read what the user says

  Scenario: S-9 A capture that heard nothing ends cleanly
    Given a capture that has heard nothing
    When I stop it
    Then I can read the end of the audio

  Scenario: S-10 A brief input change is not followed
    Given a capture of the microphone
    When the default input changes and changes back within a moment, and the input in use keeps working
    Then I can read the user's audio without a gap
```

Not capture's: choosing the call app's microphone, retries and a watchdog
(the client and root decorators), the permission (setup), telling the
user (the panel), the file (the track file). It knows nothing of
recognition.
