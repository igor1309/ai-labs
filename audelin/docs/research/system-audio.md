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

Amanu and Muesli put only the tap in the aggregate device; AudioCap adds
the output device as its main sub-device. Meetily first added the output
device as well and recorded the audio twice, as an echo.

## What decides between them

- **Echo cancellation on the mic breaks a tap in the same process.**
  MacParakeet found that `setVoiceProcessingEnabled(true)` anywhere in the
  process silently kills a process tap and leaves stale aggregate devices
  (`docs/research/vpio-process-tap-conflict.md`, macOS 15). So it moved to
  ScreenCaptureKit. It later turned voice processing off anyway, because
  that muffled the user's own voice for the other people on the call.
  Amanu does use voice processing on its mic together with a tap, so the
  conflict may depend on the macOS version or the setup (not measured
  here). Audelin leaves voice processing off its mic to stay clear of it;
  on speakers the far side then leaks into the mic track.
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

- the mic has no voice processing, so the conflict MacParakeet hit does
  not apply;
- it needs the narrower permission;
- it is what Amanu, the app the owner liked most, does.

Nothing read shows Amanu's tap wrong for the call: Muesli's scope and
start differ because it records everything from a calendar event. The one
gap is the restart, which Amanu names itself. How Audelin splits the work
follows its own architecture, not Amanu's classes: the tap is one adapter,
the process list another, and choosing the call's processes is a component
of its own
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
- **A muted tap on our own process hears a quiet tone** (`call-audio-access.swift`,
  2026-10-29, run from a terminal with the permission granted, system output
  muted). The process plays digital silence, then a 1 kHz tone at -60 dBFS
  peak for 200 ms. The tap, muted, own process only, auto-start off, started
  by hand, reads 48 kHz stereo float. Silence gives exact zeros; the tone
  gives 19,386 nonzero samples of 49,152, peak 0.000999993, and nothing
  reaches the speakers. With the permission denied (run from Ghostty, not
  granted there, by the owner): every native call returns 0, the tap runs
  with 48 callbacks over the tone, and all 49,152 samples are exact zeros,
  peak 0.0. So the tone tells a granted tap from a denied one without any
  private API; the call's own quiet cannot fool it, as the tone is ours.


## Yogurt comparison (2026-11-15)

Source review only; neither recorder was run for this comparison. Yogurt is
pinned to [a7596ec](https://github.com/FrigadeHQ/yogurt/blob/a7596ec6471763ea059effed8be1ad7d8efd5959/app/native/yogurt-audio/main.swift)
(`app/native/yogurt-audio/main.swift`); Audelin to `db1f2ade`.
Yogurt's comments report field failures; they are not measurements on this Mac.
The earlier probes above remain the local evidence. Yogurt writes separate
`me.m4a` and `them.m4a` tracks, so the earlier comparison's mixed-track
distinction no longer holds at this revision.

### Scope and excluding our own sound

Yogurt's `yogurtProcesses()` (lines 284–294) enumerates Core Audio process
objects and excludes the recorder helper, its parent Electron app, and the
parent's direct children. This is a snapshot taken when `SystemAudio.start()`
creates a stereo global tap (lines 366–370), not a recursive descendant walk
or a continuously updated exclusion list. New helpers are picked up on a
rebuild. All other apps, including music and notifications, remain audible.

Audelin's `CallAppProcesses` chooses only the matching call-app processes
when available; otherwise it retains its last selection or falls back to all
processes except those marked `isAudelin`. The composer also has an explicit
`everyAppButAudelin` path that excludes only `getpid()`
(`SessionPieces+Captures.swift`). `SystemAudioCapture` itself accepts either
selection, translates PIDs to Core Audio process objects, and requests a
private, unmuted **mono** mixdown. Yogurt also leaves playback unmuted but
mixes its stereo buffers to mono in software.

**Keep** the call-app scope: a global tap would include unrelated sound.
**Adopt** the exclusion principle for every global fallback: account for any
Audelin-owned process that can play audio, not just the main PID. Yogurt's
parent/sibling rule suits Electron; copying it into a native app launched by
a terminal could exclude unrelated siblings. Verify process ownership instead,
and refresh exclusions if audio-playing helpers appear during recording.
There is no reason to add an Electron-style process tree to a single-process
capture merely for parity.

### Aggregate clock and drift compensation

Audelin's `CoreAudioBinding.createDevice` builds a private aggregate containing
only the tap, with auto-start off, then explicitly starts its IO proc. It
sets neither a physical main sub-device nor `kAudioSubTapDriftCompensationKey`.
This means compensation is not explicitly requested; source alone does not
establish the effective Core Audio default.

Yogurt includes the current output device as both main sub-device and member,
sets `IsStacked` false and auto-start false, and sets
`kAudioSubTapDriftCompensationKey: true` on the tap entry (lines 379–386).
It selects the last input buffer matching the tap's channel count because
physical-device inputs can precede the tap. Audelin requires exactly one
mono buffer. Copying Yogurt's aggregate dictionary alone would therefore be
an incomplete change to Audelin's IO binding.

**Keep** the working tap-only aggregate pending hardware evidence. Yogurt's
comment that a tap-only device never runs conflicts with Audelin's existing
probe results; it is not a universal Core Audio rule. **Adopt** explicit tap
drift compensation if an output-clocked aggregate proves necessary, together
with correct stream selection. Do not claim that this synchronizes Audelin's
independent microphone engine with its call track: the setting belongs to the
tap inside one aggregate, not both capture pipelines.

### Microphone voice processing

Both use `AVAudioEngine` without voice processing. Yogurt leaves it at the
default off (lines 451–460), citing Zoom's mic becoming nearly silent while
Yogurt recorded. Audelin explicitly calls `setVoiceProcessingEnabled(false)`
for each new engine in `NativeMicrophoneBinding` and reads back the setting.
**Keep** Audelin's explicit disable; no setting needs adopting here. Neither
choice removes speaker leakage from the mic by itself. Yogurt's comment
points to later echo detection; it is not evidence that enabling engine voice
processing is now safe alongside a process tap.

### Format and route changes

Yogurt reads the tap ASBD, then overrides its sample rate with the aggregate's
nominal rate when they disagree. Its comment reports a headset delivering
16 kHz while the tap still advertised 48 kHz, causing playback at three times
the intended speed (lines 390–392). It watches both aggregate nominal rate
and tap format, plus the default output device. Changes trigger a debounced
300 ms teardown/recreation of the system capture and a track resync, preserving
meeting time across a gap. The tap listener compares sample rates, so it is
not a general handler for every ASBD layout change. Track converters are
recreated when the incoming rate changes.

Audelin validates mono native-endian float32 PCM, listens to
`kAudioTapPropertyFormat`, and updates the rate carried by each `AudioPiece`
without rebuilding the tap. An unsupported format ends the stream; device
death or abnormal IO stop also ends it. The binding does not read aggregate
nominal rate or subscribe to default-output changes. Downstream resampling
cannot correct buffers already labelled with the wrong rate. `LiveAudio`
advances by frames/rate, so rebuilding with an unaccounted gap would shorten
that track's timeline.

On the mic, Yogurt installs a tap with `format: nil`, takes each buffer's own
rate, restarts the engine after configuration changes, and rebuilds/retries
when necessary. Audelin already follows default input changes, reinstalls its
tap after configuration changes, retries an initial format refusal on a
configuration notification, and fills timestamp gaps with silence. It supplies
an explicit float32 format derived from the hardware input; Yogurt's nil-format
approach is an alternative to test, not proof that Audelin's path is broken.

**Adopt next:** test and guard against disagreement between the tap's reported
rate and the actual delivery clock; observe output/aggregate rate changes and
recover capture while preserving elapsed time. Validate any rate override
against the tap-only topology before applying Yogurt's output-clocked fix.
Keep Audelin's format validation and microphone recovery rather than replacing
them wholesale.

Before changing capture, compare tap-only and output-clocked aggregates on
built-in audio, Bluetooth entering/leaving hands-free mode, output switching,
and silence. Check tone pitch, frame count against host elapsed time, both
tracks' duration/alignment, duplicate audio and cleanup. Test late-starting own
helpers separately. These are proposed checks, not completed experiments;
no capture implementation changes are made by this research.
