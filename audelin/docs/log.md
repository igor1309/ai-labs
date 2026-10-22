# Log

## 2026-10-22

- The app exists: `Audelin.app`, a menu bar item with «Выйти», built from
  the package by `macos/scripts/bundle.sh` rather than an Xcode project, so
  CI and the agent build it with `swift build` alone. A check of ADR-001's
  module rules runs in CI; it found LiveSessionCore and CallsCore without
  tests, which they now have.
- Recording to disk is built in [macos/](../macos/) without the app: the
  activity gate and call folder names (CallDomain), the Recorder and
  FileCallStore, each test-first with every test shown red on its own
  assertion (spec-process § Building). The Recorder writes Float32 WAV
  files read by their size and writes only through FileCallStore's
  call-files port (ADR-001 invariant 10 amended, recorder Decided 4–5).
- The stabilizer is built in [macos/](../macos/) (TranscriptCore). A
  restart at the watermark with windows shifted by 0.24 s logs no word
  twice and loses none on the recorded fixtures, so the watermark stays as
  ADR-001 decision 4 has it. The fixtures showed Parakeet stretching a
  window's last word past the next window's start; such a word now commits
  once no window can read it again (decision 7 amended, stabilizer S-14).
- The v1 behaviour is specified as 48 SPEC.md and QA.md pairs, one per
  observer, under [spec/](spec/); the single v1 spec is gone.
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
