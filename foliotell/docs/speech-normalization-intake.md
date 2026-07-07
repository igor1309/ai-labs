---
date: 2026-07-08
model: claude-fable-5
description: "Intake brief: normalize FolioTell speech text so playback reads document content, not raw Markdown markup"
---

# Intake Brief — FolioTell: Normalize Text for Speech

Source: `foliotell/backlog/product.md` § "Normalize text for speech".

## What I'm Building

A speech-text normalization capability for FolioTell: when the user plays a
document, the string handed to the synthesizer is the document's *content*,
not its raw markup. Today the app speaks Markdown syntax literally — `#`
heading markers, `**`/`*` emphasis markers, link syntax like `[text](url)`,
and other structural punctuation are all read aloud. When this is done, the
spoken text is a cleaned, content-only string; the only markup handling that
exists today (skipping leading YAML front matter, controlled by the Skip/Read
setting) is preserved and becomes part of one coherent speech-text pipeline.
The visual rendering of the document is untouched — normalization applies
only to the speech input. Behavior is verified against a Pushkin-shaped
Markdown sample and mixed Markdown/plain-text cases.

## What I'm Touching

- `foliotell/Sources/Core/FrontMatterPlaybackMode.swift` — currently the only
  speech-text transformation: `speechText(from:)` optionally strips leading
  YAML front matter (BOM-aware, `---`/`...` closers). The new pipeline absorbs
  or composes with this.
- `foliotell/Sources/App/ReaderView.swift` — the single call site that builds
  the spoken string (`selectedFrontMatterMode.speechText(from: document.text)`)
  and passes it to `SpeechController.togglePrimaryControl`; also
  `documentSpeechText`, which feeds language detection and voice filtering
  from the same speech string.
- `foliotell/Sources/App/SpeechController.swift` — consumes the speech string;
  tracks progress via UTF-16 offsets *within the spoken string* (range
  callbacks from `AVSpeechSynthesizer`), so speed/voice changes resume from
  the remaining speech text. It never maps offsets back to the visual document.
- `foliotell/Sources/Core/FrontMatterRendering.swift` +
  `ReaderView.documentText` — the *visual* path (front matter as caption, body
  as plain `Text`). Stays separate and unchanged by this item.
- `foliotell/Tests/Core/` — Swift Testing suites (`@Test` structs, `#expect`),
  where the new coverage lands.

## Findings

- Scope: read all 8 `Sources/` files, 3 of 8 `Tests/Core` suites,
  `Package.swift`, the technical spec, product backlog, project log, README,
  and the Maestro flow; located and read the actual supplied Pushkin sample in
  the simulator app container. Excluded: research corpus, landing pages,
  release tooling.
- Pattern evidence: `FrontMatterPlaybackMode.speechText(from:)` is the
  established pattern for speech-text transformation — a pure function in
  `FolioTellCore` with a private `String` extension helper, covered by
  `FrontMatterPlaybackModeTests` (including a UTF-8 BOM case).
  `FrontMatterRendering.renderableText(from:)` is the parallel pattern on the
  visual side. Speech and visual transformations are already deliberately
  split into two Core types.
- The speech string is built fresh at each play/speed-change/voice-change;
  `PlaybackStateMachine` offsets are relative to the spoken string only, and
  there is no highlighting or visual-position sync — normalizing the speech
  string does not break any offset mapping.
- Language detection (`SpeechVoiceLanguage.languageCode(for:)`) runs on the
  speech string, so normalization changes its input too (front-matter keys in
  English currently sit in the detection input when mode is Read).
- The supplied Pushkin sample (simulator container,
  `А_С_Пушкин_Зимнее_утро….md`) is a YouTube-transcript Markdown file:
  ~18-line YAML front matter with quoted values, one `#` heading, one plain
  Russian paragraph. The log records it is UTF-8 BOM-prefixed. It is not in
  the repository — it exists only in the simulator container; the Maestro
  flow references it by on-device filename.
- `FolioTellCore` has zero package dependencies; the spec's constraints say
  "Native Apple frameworks only" and no network dependency.
- Test conventions: Swift Testing structs, naming
  `test_<method>_should<Assertion>_on<Condition>`, one behavioral assertion
  per test. Verification gate for this Swift-only scope: `swift test` /
  `swift build`.

## Key Constraints

- Visual rendering must not change — normalization applies to the speech
  input only (backlog bullet; the visual/speech split is an existing
  architectural seam).
- The front-matter Skip/Read setting must keep working; skip-mode stripping
  (including the BOM-prefixed case) is regression-covered and must survive.
- Native Apple frameworks only; no account/backend/network dependency
  (technical spec constraints). The package currently has zero external
  dependencies.
- New logic belongs in `FolioTellCore` as pure, testable code (established
  pattern; App layer is thin).
- Speed and voice changes must not reset playback to the beginning — the
  normalized string feeds the same UTF-16-offset resume mechanism, so it must
  be stable across those restarts.
- Repo process: PR from a branch (trunk protected), merge commit with
  `--auto --delete-branch`, tests alongside changes, `swift test` before
  commit.

## Risks & Unknowns

- Scope of "structural punctuation" is open. The backlog names front matter,
  formatting markers, headings, and link syntax explicitly, but "other
  structural punctuation" is unbounded — lists, blockquotes, code, tables,
  horizontal rules, images are all candidates. Pinned at spec stage.
- Read-mode front matter interaction is undefined. When the setting is Read,
  the app currently speaks raw `---` delimiter lines and `key: "value"` YAML
  literally. The backlog doesn't say whether Read-mode front matter also gets
  normalized or stays verbatim. Pinned at spec stage.
- Language detection input shifts. Normalization changes what
  `SpeechVoiceLanguage` sees; for the Pushkin file this should be
  neutral-to-positive (less English YAML/URL noise), but it is a behavior
  change to be aware of in tests.

## Resolved Questions

- The Pushkin sample file is **not** added to the repository. Coverage of the
  supplied sample comes from inline test strings that are themselves valid
  artifacts — mirroring the sample's load-bearing features: UTF-8 BOM prefix,
  quoted-value YAML front matter, a `#` heading, and a Russian plain-text
  body. (User decision, 2026-07-08.)
