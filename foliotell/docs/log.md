# Log

## 2026-07-08

- Release `foliotell_v0.3.1` — the reader's settings control is now the
  `slider.horizontal.3` icon only. The old summary label crammed
  speed · front-matter · voice onto one line beside the playback buttons and
  clipped with an ellipsis (`1.5x · Skip ·…`); dropping the text removes the
  truncation. Menu content (Speed / Front matter / Voice) is unchanged; the
  control keeps its `readerSettingsMenu` identifier and gains an
  accessibility label. Maestro flow now opens the menu by id.

- Release `foliotell_v0.3.0` — sentence navigation buttons (back · play/pause · forward · stop; jumps work while speaking, paused, and idle) and the word-granular live progress bar fix for short documents.


- Sentence navigation: back/forward buttons join the reader's bottom controls
  (back · play/pause · forward · stop), moving the position one sentence per
  tap in every playback state — speaking jumps restart speech at the target
  sentence, paused jumps reposition silently (resume speaks from the new
  spot), idle jumps move the stored resume point with the progress bar as
  feedback. Back clamps to the document start; forward at the last sentence
  is a no-op. Core gains sentence-boundary queries and a state-machine
  reposition (9 tests). Closes the "compact progress navigation controls"
  backlog item; on-device pass (all three states + clamps) pending.

- Fix stalled progress bar on short documents (v0.2.0 device finding): the
  bar now advances word-by-word during playback via a new unsnapped
  `PlaybackPositionMapping.documentUTF16Offset` mapping, instead of only at
  sentence transitions — a short text spends most of its playback inside one
  sentence, so the bar sat at 0. Persistence is unchanged (still
  sentence-anchored); spec rule 19 amended in place.

- Release `foliotell_v0.2.0` — per-document playback position persistence and resume: positions saved as document-text sentence anchors, resume with sentence-start backwards overlap, Start Over menu action, compact progress bar.

- Persist per-document playback position and resume: playback position is
  saved as a sentence anchor in the raw document text (stable across
  front-matter mode changes and normalization tweaks, per ADR-001), keyed by
  document path in UserDefaults behind a reader-owned store protocol. Play
  resumes from the start of the interrupted sentence (backwards overlap);
  stop parks instead of resetting; natural completion clears the record; a
  "Start Over" menu action and a thin progress bar join the bottom controls.
  Core mapping (`PlaybackPositionMapping`) built via greedy subsequence
  alignment — the speech pipeline only deletes characters — with 14 tests
  including Russian and mode-change cases. On-device resume checklist (stop/
  relaunch/finish/speed-change/Start Over) is the pending user pass.

- Docs housekeeping: README now opens with the product (orientation/landing
  pages moved to a bottom "Pages" section) and groups the doc list by kind;
  the technical spec moved to `docs/specs/`, naming research (naming brief,
  candidate evaluation) to `research/`, intake briefs to `docs/intake/`;
  `device-speech.md` states its role explicitly (living reference: design
  rationale + hypothesis ledger + diagnostic runbook). Locked the on-device
  verification of the 0.1.0 settings-menu fix (menu opens instantly on
  iPhone 15 Pro, iOS 26.5, v0.1.1) into the device-speech key facts,
  alongside the `speechVoices()` main-thread rule.

- Close the stop-latency backlog item: v0.1.1 on device (iPhone 15 Pro,
  iOS 26.5) stops immediately. The 0.0.3 latency was most plausibly the
  render-path `speechVoices()` main-thread stall removed by the 0.1.0
  menu-freeze fix; recorded in the `device-speech.md` hypothesis table as
  probable cause, with the stop-path instrumentation kept as the reopen path.

- Release `foliotell_v0.1.1` — stop/pause-path instrumentation for the
  on-device stop-latency investigation; no behavior change.
- Instrument the stop and pause paths for the device stop-latency
  investigation: log `stopSpeaking`/`pauseSpeaking` acceptance,
  `didFinish`/`didCancel` arrival, and audio-session deactivation outcomes
  (previously a bare `print`) under the `foliotell.FolioTell` subsystem. No
  behavior change. Simulator baseline recorded in `device-speech.md`: full
  machine-side stop sequence ~12 ms, synthesizer delivers `didFinish` (not
  `didCancel`) after stop — the audible latency is device-side.

- Release `foliotell_v0.1.0` — speech text normalization, the iPhone settings-menu freeze fix, and the portable TestFlight upload path.
- Fix the reader settings menu freezing the app on iPhone: query the voice
  catalog once off the main actor and cache it instead of calling
  `AVSpeechSynthesisVoice.speechVoices()` several times per render, and
  detect document language without the full normalization pass on the render
  path.
- Normalize document text for speech: playback now speaks document content
  instead of raw Markdown markup — heading markers, emphasis/strong/
  strikethrough markers, inline code backticks, code fences, link/image
  syntax, list and blockquote markers, and delimiter-only lines are stripped
  from the spoken string (URLs are never spoken), while the visual document
  rendering stays unchanged. Language detection and voice filtering now run
  on the same normalized speech string. Covered by a Pushkin-shaped inline
  sample (BOM + YAML front matter + heading + Russian body) and mixed
  Markdown/plain-text cases.

- Add a self-contained release runbook (commands, gates, Xcode/altool caveats,
  tag recovery) and a device-speech doc (design rationale, falsified hypotheses,
  Console diagnostic procedure); fix the README's stale `FOLIOTELL_VERSION`
  default.

- Make the TestFlight upload portable across runner Xcode generations:
  documented `altool --apiKey/--apiIssuer` flags with the key in
  `~/.appstoreconnect/private_keys`, plus a newest-Xcode selection step in the
  deploy job, after the `foliotell_v0.0.3` run failed on a Xcode 16.4 runner
  whose altool rejects the previous flag spellings.

- Release `foliotell_v0.0.3` with the catalog-based automatic voice
  resolution fix for silent reading on device.

- Resolve the automatic speech voice from the installed voice catalog,
  preferring voices with populated audio settings, instead of trusting
  `AVSpeechSynthesisVoice(language:)`, which can return a voice that produces
  no audio on device; log the resolved voice so device failures are
  diagnosable from the console. Addresses reading still silent on device in
  TestFlight 0.0.2.

## 2026-07-07

- Prepare patch release `foliotell_v0.0.2` for the TestFlight device-speech
  fix, keeping upload flow pinned to Apple team/provider `VRVJ9YNRQU`.

- Configure FolioTell's iOS audio session for spoken playback and declare
  background audio mode so TestFlight builds can read documents audibly on
  device instead of depending on the default app audio session.

## 2026-07-06
- Deploy the public FolioTell landing page to Cloudflare Pages at `https://foliotell.pages.dev`, including its privacy page, and record the Pages URL in the App Store Connect product card.

- Back up FolioTell's App Store Connect product metadata in a repo product card, including app identity, localized app info, version localization copy, unset fields, and API limitations for category and what's-new updates.

- Add a public marketing landing page for the App Store submission under `landing/`: a self-contained, theme-aware `index.html` (deep-blue brand matching the app icon, teal accents, hero with App Store "coming soon / in review" badge, feature and how-it-works sections, privacy emphasis) plus a matching `privacy.html` policy page and a copy of the 1024×1024 app icon. Distinct from the internal orientation surface at `index.html`.

- Opt FolioTell iPhone archives out of Mac Designed for iPhone/iPad and Apple Vision Pro compatibility build settings so App Store Connect does not treat uploads as publishable on unsupported platforms.

- Declare FolioTell export compliance in the app Info.plist so TestFlight uploads include `ITSAppUsesNonExemptEncryption=false`.

- Prepare FolioTell's first release tag as `foliotell_v0.0.1`: align the canonical release metadata and generated release-unit manifest with the implemented v0.0.1 app and bind the TestFlight deploy job to its GitHub environment secrets.

- Register FolioTell as a release unit (`foliotell_v<version>` tags) and route TestFlight uploads through the existing release-unit workflow instead of ordinary merge CI. The release job runs Swift build/test/archive gates on macOS, writes the App Store Connect API key from secrets, then invokes the team-pinned TestFlight distribution script.

- Lower the package tools version to Swift 6.1 so GitHub Actions can build the
  FolioTell package with the macOS runner's installed Swift toolchain.

- Move the TestFlight backlog under the FolioTell project and add a
  project-local product backlog covering the next priorities: playback resume,
  background playback validation, speech text normalization, real-device
  language/voice validation, compact navigation controls, recent documents,
  reusable Maestro regressions, and Markdown rendering polish.

- Close the TestFlight packaging gap: add an archive-ready iOS Xcode project wrapper around the existing Swift sources, pin export/team settings to Apple team `VRVJ9YNRQU` and bundle id `foliotell.FolioTell`, add `scripts/distribute-testflight.sh` for API-key based archive/export/upload automation that refuses any other team/provider, and extend CI to verify the unsigned iOS archive wrapper.

- Move the original UI-research prompt into `foliotell/research/` so the generated source inventories, screenshots, inventory, and comparison table keep their originating artifact in the project.

- Add the iPhone text-to-speech reader UI reference corpus under `foliotell/research/`: per-app source inventories, downloaded App Store/official screenshots, interaction inventory, and comparison table for the document-reader design.

- Filter selectable voices to the detected document speech language, falling back to all installed voices only when no language-matched voices exist.
- Add persisted voice selection to the reader settings menu, with Auto preserving language-based voice choice and installed voices overriding playback directly.
- Render leading YAML front matter as caption-sized secondary text in the reader while preserving normal body styling and existing speech skip/read behavior.
- Move reader controls into the bottom safe-area inset and replace the speed picker/front-matter toggle with a compact settings menu.
- Select a Russian speech voice for Cyrillic text so the supplied Pushkin document is spoken as Russian instead of through the system default voice.
- Compact the front-matter setting from a segmented control into a switch, keep Play/Pause/Resume at a stable width, and fix skip mode for UTF-8 BOM-prefixed Markdown so the supplied Pushkin file no longer speaks its YAML front matter.
- Add a persisted front-matter playback setting, defaulting to skipping leading YAML front matter for speech while allowing the user to switch to reading it.
- Fix live speed changes restarting from the beginning: speech progress is now tracked from `AVSpeechSynthesizer` range callbacks, and speed replacement restarts from the remaining text boundary instead of replaying the full document.
- Collapse playback into one primary Play/Pause/Resume button plus Stop so the visible control matches the current playback state instead of showing a disabled or misleading separate Play button.
- Fix the Play button state in the playback cycle: the primary Play control is now disabled while speech is speaking or paused, Pause/Resume and Stop remain enabled during active playback, and the reusable Maestro flow verifies that tapping Play while paused does not restart playback.
- Persist the simulator playback-control regression as a reusable Maestro flow, add the supplied app icon as a processed 1024x1024 asset catalog resource, and add a FolioTell CI workflow that runs Swift build/test gates only for code, tests, app resources, Maestro flow, or FolioTell CI changes.
- Fix playback controls staying disabled while audio continues: move playback state into a tested core state machine, preserve `speaking` across internal `AVSpeechSynthesizer` cancellation during playback restarts, add stable accessibility identifiers for controls, rebuild/reinstall on the iOS simulator, and verify the Russian Markdown file with Maestro through Play → Pause → Resume → Stop.
- Implement v0.0.1 as a Swift package: add a SwiftUI `DocumentGroup` app shell, read-only `FileDocument` loading for Markdown/plain-text files, a reader screen with play/pause-resume/stop controls, persisted speed presets, `AVSpeechSynthesizer` playback, concise load errors, and core Swift Testing coverage for document loading and speed mappings.
- Establish foliotell project: a native document-to-speech iPhone app that reads local Markdown and plain-text files aloud (working name, naming/spec stage). Add naming brief, candidate evaluation, and technical specification (front matter normalized to repo convention), README, an internal orientation page, and a project log; classify the directory across the dashboard, README Components table, and workspace landing pages.

## 2026-07-05
- Origin: recurring real pain listening on the go to lectures, summaries, and reading materials I hold as text. Tried a lot of App Store text-to-speech / document readers and didn't find one I liked. Decided to build my own — a document-first, offline reader for my own files.
