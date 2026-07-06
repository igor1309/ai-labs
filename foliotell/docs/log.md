# Log

## 2026-07-06
- Move the original UI-research prompt into `foliotell/research/` so the generated source inventories, screenshots, inventory, and comparison table keep their originating artifact in the project.

- Add the iPhone text-to-speech reader UI reference corpus under `foliotell/research/`: per-app source inventories, downloaded App Store/official screenshots, interaction inventory, and comparison table for the document-reader design.

- Persist the simulator playback-control regression as a reusable Maestro flow, add the supplied app icon as a processed 1024x1024 asset catalog resource, and add a FolioTell CI workflow that runs Swift build/test gates only for code, tests, app resources, Maestro flow, or FolioTell CI changes.
- Fix playback controls staying disabled while audio continues: move playback state into a tested core state machine, preserve `speaking` across internal `AVSpeechSynthesizer` cancellation during playback restarts, add stable accessibility identifiers for controls, rebuild/reinstall on the iOS simulator, and verify the Russian Markdown file with Maestro through Play → Pause → Resume → Stop.
- Implement v0.0.1 as a Swift package: add a SwiftUI `DocumentGroup` app shell, read-only `FileDocument` loading for Markdown/plain-text files, a reader screen with play/pause-resume/stop controls, persisted speed presets, `AVSpeechSynthesizer` playback, concise load errors, and core Swift Testing coverage for document loading and speed mappings.
- Establish foliotell project: a native document-to-speech iPhone app that reads local Markdown and plain-text files aloud (working name, naming/spec stage). Add naming brief, candidate evaluation, and technical specification (front matter normalized to repo convention), README, an internal orientation page, and a project log; classify the directory across the dashboard, README Components table, and workspace landing pages.

## 2026-07-05
- Origin: recurring real pain listening on the go to lectures, summaries, and reading materials I hold as text. Tried a lot of App Store text-to-speech / document readers and didn't find one I liked. Decided to build my own — a document-first, offline reader for my own files.
