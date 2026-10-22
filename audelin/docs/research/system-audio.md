# Capturing the call's audio: prior art (2026-10-22)

How the open-source Mac meeting recorders get the far side of a call, the
«они» track. Read from source, not run. Revisions: Amanu c5950c5
(2026-10-06), Muesli 827e5f5 (2026-10-22), MacParakeet c507a36
(2026-10-19), anarlog 98d6219 (2026-10-22), Meetily a2cb62e (2026-09-10),
AudioCap 6f609e8 (2025-08-07). This Mac runs macOS 26.6.2.

## Two ways in

| Way | Who uses it | Permission |
|---|---|---|
| Core Audio process tap (`CATapDescription` → `AudioHardwareCreateProcessTap` → private aggregate device holding only the tap → IO proc), macOS 14.2+ | Amanu; Muesli by default; anarlog; Meetily as an option; AudioCap, the reference sample | "System Audio Recording Only", prompted the first time a tap is created; `NSAudioCaptureUsageDescription` in Info.plist |
| ScreenCaptureKit `SCStream` with `capturesAudio` | MacParakeet; Muesli as fallback; Meetily by default | "Screen & System Audio Recording" |

All of them put only the tap in the aggregate device. Meetily first added
the output device as well and recorded the audio twice, as an echo.

## What decides between them

- **Echo cancellation on the mic breaks a tap in the same process.**
  MacParakeet found that `setVoiceProcessingEnabled(true)` anywhere in the
  process silently kills a process tap and leaves stale aggregate devices
  (`docs/research/vpio-process-tap-conflict.md`, macOS 15). So it moved to
  ScreenCaptureKit. It later turned voice processing off anyway, because
  that muffled the user's own voice for the other people on the call.
  Amanu does use voice processing on its mic together with a tap. Audelin's
  mic is raw (headphones, mvp.md), so this conflict does not arise.
- **ScreenCaptureKit conflicts with screenshots.** Muesli moved to the tap
  partly because `SCStream` broke its window screenshots during a meeting.
  It also wanted the narrower permission.
- **Phone and FaceTime calls can be missing.** MacParakeet's issue #912:
  ScreenCaptureKit gave exact zeros while a FaceTime call was connected.
  The cause is unconfirmed (the call audio may go through a system daemon).
  Zoom and browser calls are not affected.

## How to set up a tap

- **Scope.**
  - Amanu taps only the call app's processes, matched by bundle-id prefix,
    so notification sounds and music stay off the track. A browser plays
    call audio from its renderer helpers, so it matches the whole family.
    Amanu re-points the tap every 15 s as processes come and go. If nothing
    matches, it taps everything: "recording nothing is wrong in the way that
    loses the meeting". On macOS 26 it also sets `bundleIDs` and
    `isProcessRestoreEnabled`, so the tap follows an app that restarts.
  - Muesli, anarlog and Meetily tap everything except their own process.
- **Starting.** Amanu and AudioCap use `TapAutoStart`. Muesli turned it off
  after #600: a global tap recording from a calendar event, before Zoom
  joined, overloaded `coreaudiod`, and Zoom froze for about 60 s starting its
  audio. Amanu's case is different: it taps only the call app, and only once
  the call has started.
- **Format.** The tap delivers the output device's format: 48 kHz stereo
  float32 on the built-in speakers (MacParakeet probe). The rate changes
  when the output device changes. anarlog re-reads it every 128 buffers;
  Muesli resamples to 16 kHz mono inside the recorder. Audelin's
  `AudioConversion` already makes 16 kHz mono from any rate.
- **Route changes.** Bluetooth headsets switching profile mid-call are the
  hard case. Muesli rebuilds the tap after a failure, retrying after 2 s
  and 5 s, and waits 1.5 s for the route to settle. Amanu lists "the system
  tap has no restart" as an open gap, not a choice (`docs/pitfalls.md`):
  its track is one `AVAudioFile`, which cannot be appended to.
- **Cleanup.** Muesli gives its private aggregate device a fixed UID.
  Private devices cannot be listed, so a crash with a fresh UUID each time
  leaves settings entries behind for good.
- **Permission when run from a terminal.** macOS asks on behalf of the
  responsible process, so a program started from a shell borrows the
  terminal's grants (Amanu `docs/pitfalls.md`). The preview app run with
  `swift run` gets the terminal's prompt. The real app needs its own bundle,
  its usage string and a stable signature, because the grant is tied to the
  signature.

## What Audelin takes

A Core Audio process tap, because:

- the mic stays raw, so the voice-processing conflict does not apply;
- it needs the narrower permission;
- it is what Amanu, the app the owner liked most, does.

Nothing read shows Amanu's tap wrong for the call: Muesli's scope and
start differ because it records everything from a calendar event. The one
gap is the restart, which Amanu names itself. How Audelin splits the work
follows its own architecture, not Amanu's classes: the tap is one adapter,
the process list another, and choosing the call's processes is a Core
([specs](../spec/system-audio-capture/SPEC.md)).

The adapter maps tap buffers to `AudioChunk`. Writing them to disk is a
decorator on the capture, wired at the composition root.

## Measured on this Mac

2026-10-22, macOS 26 (Darwin 25.6), with the probes in [probes](probes/),
each on a muted `afplay` child it starts itself:

- **A tap leaves no gaps** (`tap-silence.swift`). A tap on `afplay`, with
  2 s of digital silence in the file, the process frozen 2 s by `SIGSTOP`,
  and 2 s after it quit, gave 47 callbacks and about 48,000 frames a
  second throughout, sample times without a break, zeros in each quiet
  stretch. Muesli's "a tap delivers nothing while nothing plays" does not
  hold here, so a track needs no gap filling.
- **Process changes are told** (`process-notifications.swift`). The
  process list's change fires when a process appears and when it leaves.
  On a process, `IsRunning` (`pir?`) and its device list fire when it
  starts playing; `IsRunningOutput` changed (0 to 1) but was never told on
  its own, so it is re-read when `IsRunning` fires. A frozen process stays
  running.
- **Microphone use is told** (`mic-notifications.swift`, the owner driving
  the apps). Voice Memos, a Safari tab (`com.apple.WebKit.GPU`) and Amanu
  each starting and stopping were all told, the recording flag
  (`IsRunningInput`) re-read on the notification: a start came on
  `IsRunning` (`pir?`) or the device list (`pdv#`), a stop on the device
  list. Voice Memos' flag flickered on, off and on within 70 ms of its
  start. One change went untold: Siri's always-on listener
  (`com.apple.CoreSpeech`) stopping, seen only by sampling every 0.5 s.
