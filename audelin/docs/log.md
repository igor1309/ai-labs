# Log

## 2026-10-23

- A process replaced while its microphone flag is read cannot start a call
  under the previous process's app (LAB-473).

- Queued audio notifications cannot report a call for another process that
  reuses the same Core Audio object (LAB-473).

- Core Audio lists audio processes and tells calls in Zoom, Telemost and
  browsers, keeping a call through microphone silences under 30 s (LAB-473).

## 2026-10-22

- Session, automatic recording and timed track are gone, after the owner's
  audit: files are decorators on the captures, when a recording runs waits
  for the app's main shape, and a tap on this Mac leaves no gaps to time
  ([measured](research/system-audio.md#measured-on-this-mac)). Audio
  processes and call watch are one Core Audio wrapper that streams calls
  from Core Audio's own notifications instead of re-reading a list.
- The call's audio has two specs: call app processes picks Amanu's
  processes to tap (the call app and its helpers, else every app but
  Audelin), and system audio capture taps them, keeps call time through
  silence and fails rather than rebuilding. Two Codex challenges
  shaped them.
- Live text no longer settles words at a pause: only the recogniser makes
  words final, within a bounded stretch of audio, and segments are cut
  afresh at each change. Settling at a pause kept a quick reading that a
  better one was about to replace (research run 7b).
- Nemotron makes its last word final once two chunks pass it with nothing
  new: its longest wait for a final word on the real call drops from 31 s
  to 2.7 s, and no final word changed (research run 8).
- A two-pass recogniser shows a fast recogniser's draft and settles a
  better one's final words; with Nemotron drafting and Parakeet final, the
  settled text on the real call is Parakeet's, word for word (run 8).
- Loading the models is now a requirement (S-15, S-16, mvp.md): they load
  at launch, recording never waits, the panel says live text is getting
  ready, and live text catches up. The preview app's first load compiled
  them for about 30 s with nothing on screen (research run 9).
- Prior art for the call's audio (research/system-audio.md): Amanu,
  Muesli, anarlog and AudioCap use a Core Audio process tap; MacParakeet uses
  ScreenCaptureKit because echo cancellation on the mic kills a tap in the
  same process. Audelin's mic is raw, so it takes the tap; the tap's scope
  and start are still open.
- Nemotron 3.5 hears Russian speech as it streams, settling each word when
  the next starts and finishing the remaining audio (LAB-403).
- The Parakeet recogniser is built test-first: Parakeet v3 in Audelin's own
  windows behind Live text's recogniser interface. Replayed through Live
  text, the recorded windows settle every word once. A report now says
  where it starts, so a word the next window no longer hears is gone.
- The Parakeet recogniser's review fixes: a final word stretched past the
  next window no longer freezes the pending words it overlaps, a track
  under 0.3 s finishes, and the model port has its own window-timed word.
- Started over: the architecture decision, every spec and the Swift
  package are removed. The architecture decision is written again from
  scratch, then the specs, then the code.
- CallDomain is gone, with every module built on it (LiveSessionCore,
  CallsCore, Recorder, FileCallStore and their test support) and the app
  target. CallDomain had no job of its own: a call's file format, its
  folder-name rule and an activity gate no feature asked for, in one
  module. Only TranscriptCore remained.
- The capture specs no longer test Core Audio. Mic and system audio
  capture QA drove the hardware (a loopback device, a USB headset, a click
  within 20 ms, levels within 0.5 dB), which proves Apple's framework and
  needs gear the owner does not have. Each adapter is now a thin binding
  plus the translation it owns (host times to the session clock, callbacks
  to faults, Stop), tested through a fake of the binding; the binding is
  proven on a real call. A debug-menu trigger that switches the microphone
  replaced the USB headset.
- The recording session is built in LiveSessionCore, test-first on fakes
  of its ports: capture per track, new calls, recording files, live
  recognition and the session clock. Captured audio is written on the
  capture's own thread and reported to recognition through a stream the
  session never waits on, so Stop is immediate with a stuck recogniser or
  no model. Capture and disk faults are recording-faults', next.
- Agister reviews of the two merged build PRs found five things to fix,
  now fixed test-first: Recorder file names wrapped past 32 bits of
  microseconds (about 36 minutes into a call); a failed copy could delete
  a folder already at the target; deleting the source after a copy used a
  stored path rather than the call's id; the module check missed
  `public import` and `import struct` forms; a stale comment. Tests no
  longer sleep to show that something did not happen, and the Trash tests
  use a disk image's Trash instead of the user's.
- The app exists: `Audelin.app`, a menu bar item with «Выйти», built from
  the package by `macos/scripts/bundle.sh` rather than an Xcode project, so
  CI and the agent build it with `swift build` alone. A module-rule check
  runs in CI; it found LiveSessionCore and CallsCore without
  tests, which they now have.
- Recording to disk is built without the app: the
  activity gate and call folder names (CallDomain), the Recorder and
  FileCallStore, each test-first with every test shown red on its own
  assertion. The Recorder writes Float32 WAV files read by their size and
  writes only through FileCallStore's call-files port.
- The stabilizer is built (TranscriptCore). A
  restart at the watermark with windows shifted by 0.24 s logs no word
  twice and loses none on the recorded fixtures, so the watermark stays. The fixtures showed Parakeet stretching a
  window's last word past the next window's start; such a word now commits
  once no window can read it again.
- The v1 behaviour is specified as 48 SPEC.md and QA.md pairs, one per
  observer; the single v1 spec is gone.
- Terms on clean speech: Parakeet v3 through Audelin's own windows gives
  RACI and OKR only in Cyrillic and SLA in Latin letters half the time, so
  live terms are out of v1 and the live engine is revisited before v2
  ([tests.md](research/tests.md) run 5). Its replies are the stabilizer's
  fixtures.

## 2026-10-21

- v1 records calls on its own: recording starts when a call starts and
  stops when it ends; live text can be switched off, so Audelin replaces
  Amanu.
- ADR-001: v1 is one modular app; it records first, runs one live stream per
  track, and logs only through decorators in the composition root.
- Name: Audelin, in Russian Одели́н; CLI `audelin`, data in `~/.audelin`.
- Design: Glass Ledger visual language and Screens 1–8, light and dark.
- Versions planned: v1 live transcript, v2 term explanation through bb, v3
  final pass and summary.
- Spike: Parakeet v3 through FluidAudio's sliding window works live with 4 s
  chunks; English terms came out in Cyrillic or wrong, which is still to be
  tested on clean speech. Two live streams at once (mic and call audio) cost
  almost nothing.
- Tried existing apps on real Zoom calls: Superwhisper, Amanu, MacParakeet
  and MacWhisper. None combined a smooth, selectable live transcript with
  explaining a selected term, so we decided to build our own native macOS
  app instead of forking one.
