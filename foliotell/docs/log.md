# Log

## 2026-07-06
- Move the original UI-research prompt into `foliotell/research/` so the generated source inventories, screenshots, inventory, and comparison table keep their originating artifact in the project.

- Add the iPhone text-to-speech reader UI reference corpus under `foliotell/research/`: per-app source inventories, downloaded App Store/official screenshots, interaction inventory, and comparison table for the document-reader design.

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
