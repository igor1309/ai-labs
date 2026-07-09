# Log

## 2026-07-09

- Stabilize the open playback-settings menu during word-level progress updates:
  isolate its equatable content state from transport/progress rendering and
  cover the projection with a regression test.

- Auto voice selection now prefers the highest-quality installed voice
  (Premium > Enhanced > compact) among audio-capable exact-language matches,
  so an installed Enhanced Russian voice wins over compact Milena; quality
  still never overrides audio-capability (silent-voice bug class). Landing
  page points users at the Settings voice-download path; backlog gains
  voice-quality onboarding, on-device neural TTS (flagged for UI discussion),
  and a gated cloud-TTS option.

- Release `foliotell_v0.4.3` — playback rebuilt on two IMRX-style state
  machines (transport + position, ADR-002) with behavior parity, and the
  Maestro iOS 26 simulator runbook with a re-baselined playback-controls flow.

- Re-baseline the playback-controls Maestro flow for iOS 26: browser-state
  navigation, double-tap open, idle Start Over position reset, and verified
  menu interactions with one retry; three consecutive green runs on the
  seeded 26.3 simulator. Runbook updated with the fixture-length requirement
  and menu-retry pattern.

- Capture the Maestro-on-iOS-26 investigation as a runbook
  (`docs/maestro-simulator-runbook.md`): environment history (iOS 18 flow home
  orphaned by the deployment-target bump), working 26.3 simulator, fixture
  seeding, and the synthesized-input quirks (double-tap to open, rename trap,
  menu settle waits).

## 2026-07-08

- Restructure playback around two IMRX-style state machines (ADR-002):
  transport (utterance lifecycle, token-scoped synthesizer callbacks) and
  position (cached derivation, anchor persistence) in Core, wired at an
  App-layer composition root with spy-tested effect handlers and wiring tests;
  `SpeechController` and `PlaybackStateMachine` removed, views split into pure
  presentation plus observable wrapper. Two Codex adversarial reviews hardened
  token monotonicity, scoped pause/resume resolutions, and the paused word
  boundary. Behavior parity verified on simulator (playback-controls
  assertions); per-word position mapping dropped from O(document) to lookups.

- Release `foliotell_v0.4.2` — reader bottom-bar fix: playback controls render
  again in the document reader.

- Fix the reader bottom bar not rendering (0.4.1 regression): `DocumentGroup`
  drops `.bottomBar` toolbars; playback controls restored on every launch path.

- Make TestFlight release archives unsigned so App Store Connect distribution
  signing happens during export.

- Release `foliotell_v0.4.1` — native Liquid Glass bottom-bar toolbar for the
  reader controls.

- Fix the TestFlight archive signing identity to request Apple Distribution
  provisioning.

- Rebuild the reader controls as a native bottom-bar toolbar: transport in one
  centered Liquid Glass capsule, settings in its own, progress ribbon
  overlaying the text.

- Release `foliotell_v0.4.0` — Liquid Glass reader controls; deployment target
  raised to iOS 26.

- Reader controls adopt Liquid Glass (iOS-only); deployment target raised to
  iOS 26 and CI selects the newest Xcode.

- Release `foliotell_v0.3.1` — icon-only reader settings control, fixing the
  truncated summary label.

- Release `foliotell_v0.3.0` — sentence navigation and the word-granular live
  progress bar.

- Sentence navigation: back/forward buttons move the position one sentence per
  tap in every playback state; closes the "compact progress navigation
  controls" backlog item (on-device pass pending).

- Fix the progress bar stalling on short documents: it now advances
  word-by-word during playback.

- Release `foliotell_v0.2.0` — per-document playback position persistence and
  resume.

- Persist playback position per document and resume from the interrupted
  sentence (ADR-001): stop parks instead of resetting, finishing clears the
  record, "Start Over" and a progress bar join the controls; on-device
  checklist pending.

- Docs housekeeping: README reorganized around the product; specs, research,
  and intake briefs moved to their own homes; `device-speech.md` declared a
  living reference and updated with the 0.1.0 menu-fix device verification.

- Close the stop-latency backlog item: v0.1.1 stops immediately on device;
  probable cause and reopen path recorded in `device-speech.md`.

- Release `foliotell_v0.1.1` — stop/pause-path instrumentation for the
  on-device stop-latency investigation; no behavior change.

- Instrument the stop and pause paths for the stop-latency investigation (no
  behavior change); simulator baseline recorded in `device-speech.md`.

- Release `foliotell_v0.1.0` — speech text normalization, the iPhone
  settings-menu freeze fix, and the portable TestFlight upload path.

- Fix the reader settings menu freezing on iPhone by querying the voice
  catalog once off the main actor.

- Normalize document text for speech: playback speaks content instead of raw
  Markdown markup, visual rendering unchanged; language detection and voice
  filtering use the same speech string.

- Add a self-contained release runbook and the `device-speech.md` reference;
  fix the README's stale `FOLIOTELL_VERSION` default.

- Make the TestFlight upload portable across runner Xcode generations after
  the `foliotell_v0.0.3` run failed on an Xcode 16.4 runner; details in the
  runbook.

- Release `foliotell_v0.0.3` — catalog-based automatic voice resolution,
  fixing silent reading on device.

- Resolve the automatic speech voice from the installed voice catalog instead
  of `AVSpeechSynthesisVoice(language:)`, which can return a silent voice on
  device.

## 2026-07-07

- Prepare patch release `foliotell_v0.0.2` for the TestFlight device-speech
  fix, keeping the upload flow pinned to Apple team/provider `VRVJ9YNRQU`.

- Configure the iOS audio session for spoken playback and declare background
  audio mode so TestFlight builds read audibly on device.

## 2026-07-06

- Deploy the public FolioTell landing page to Cloudflare Pages at
  `https://foliotell.pages.dev`, including its privacy page.

- Back up FolioTell's App Store Connect product metadata in a repo product
  card.

- Add a public marketing landing page and privacy policy under `landing/` for
  the App Store submission.

- Opt iPhone archives out of Mac and Apple Vision Pro compatibility so App
  Store Connect does not offer unsupported platforms.

- Declare export compliance in the app Info.plist
  (`ITSAppUsesNonExemptEncryption=false`).

- Prepare FolioTell's first release tag `foliotell_v0.0.1`: metadata, manifest,
  and TestFlight deploy secrets aligned.

- Register FolioTell as a release unit (`foliotell_v<version>` tags) with
  TestFlight uploads through the release-unit workflow.

- Lower the package tools version to Swift 6.1 so GitHub Actions can build
  with the macOS runner's toolchain.

- Move the TestFlight backlog under FolioTell and add a project-local product
  backlog.

- Close the TestFlight packaging gap: archive-ready Xcode project wrapper,
  team-pinned `scripts/distribute-testflight.sh`, CI verification of the
  unsigned iOS archive.

- Move the original UI-research prompt into `foliotell/research/`.

- Add the iPhone text-to-speech reader UI reference corpus under
  `foliotell/research/`.

- Filter selectable voices to the detected document language, falling back to
  all installed voices.
- Add persisted voice selection, with Auto keeping the language-based choice.
- Render leading YAML front matter as caption-sized secondary text.
- Move reader controls into the bottom safe-area inset with a compact settings
  menu.
- Select a Russian voice for Cyrillic text so the Pushkin document is spoken
  in Russian.
- Compact the front-matter setting into a switch and fix skip mode for
  BOM-prefixed Markdown.
- Add a persisted front-matter playback setting, defaulting to skip.
- Fix live speed changes restarting playback from the beginning.
- Collapse playback into one Play/Pause/Resume button plus Stop.
- Fix the Play-button state through the playback cycle, verified by the
  Maestro flow.
- Persist the playback-control regression as a reusable Maestro flow, add the
  app icon asset, and add a scoped FolioTell CI workflow.
- Fix playback controls staying disabled during audio: playback state moved
  into a tested core state machine.
- Implement v0.0.1: SwiftUI `DocumentGroup` shell, read-only
  Markdown/plain-text loading, reader with playback controls and persisted
  speed, `AVSpeechSynthesizer` playback, core test coverage.
- Establish foliotell: a native document-to-speech iPhone app for local
  Markdown and plain-text files (naming brief, candidate evaluation, technical
  spec, README, orientation page, log; dashboard and README classification).

## 2026-07-05

- Origin: recurring real pain listening on the go to lectures, summaries, and
  reading materials I hold as text. Tried a lot of App Store text-to-speech /
  document readers and didn't find one I liked. Decided to build my own — a
  document-first, offline reader for my own files.
