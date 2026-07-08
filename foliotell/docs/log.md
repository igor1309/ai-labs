# Log

## 2026-07-08

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
