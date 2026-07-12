---
date: 2026-07-09
model: claude-fable-5
description: "Runbook for running FolioTell Maestro flows on iOS 26 simulators: environment history, fixture seeding, and the synthesized-input quirks that cost a debugging session to discover."
---

# Maestro Simulator Runbook

How to run the FolioTell Maestro flows (`foliotell/.maestro/flows/`) on a
simulator, including the environment facts and input quirks discovered on
2026-07-08. Follow this instead of re-deriving; every step below was verified
live.

## Environment History

- `playback-controls.yaml` was authored against **iPhone 15 Pro ios18**
  (`6DEBB309-FFF5-4333-A8C5-AA0E3DEC927F`, iOS 18.6) and last passed there on
  the morning of 2026-07-08.
- The same day, commit `702ebadfe` raised `IPHONEOS_DEPLOYMENT_TARGET` to
  26.0 — current builds **cannot install** on that simulator. The flow's
  original environment is orphaned; its single-tap geometry assumptions do not
  hold on iOS 26 (see quirks below).
- Working replacement: **FolioTell iPhone 26.3**
  (`CDD03FAA-8B2B-44CD-B65D-77F2DF128C40`, iPhone 17 Pro, iOS 26.3), created
  and seeded on 2026-07-08. If it is gone, recreate with:

  ```bash
  xcrun simctl create "FolioTell iPhone 26.3" "iPhone 17 Pro" \
    "com.apple.CoreSimulator.SimRuntime.iOS-26-3"
  ```

## Build and Install

```bash
cd foliotell
xcodebuild build -project FolioTell.xcodeproj -scheme FolioTell \
  -configuration Debug -destination "id=<UDID>" \
  -derivedDataPath /tmp/foliotell-sim-dd CODE_SIGNING_ALLOWED=NO
xcrun simctl install <UDID> \
  /tmp/foliotell-sim-dd/Build/Products/Debug-iphonesimulator/FolioTell.app
```

## Fixture Seeding

The flow expects the Pushkin document. The file is not in the repo; seed it
into the app's container (it appears under On My iPhone → FolioTell because
the app sets `UISupportsDocumentBrowser` + `LSSupportsOpeningDocumentsInPlace`):

```bash
CONTAINER=$(xcrun simctl get_app_container <UDID> foliotell.FolioTell data)
printf '\xef\xbb\xbf---\ntitle: "Зимнее утро"\nauthor: "А. С. Пушкин"\n---\n# Зимнее утро\n\nМороз и солнце. День чудесный. ...\n' \
  > "$CONTAINER/Documents/А_С_Пушкин_Зимнее_утро.md"
```

Any BOM-prefixed front-matter Markdown with Russian text works — but it MUST
provide **several minutes of speech** (≥ ~6000 characters). The persisted
speed setting can map to a fast synthesis rate: a ~1.5k-character fixture
finished naturally in ~18 seconds, ending playback before the flow's asserts
(each Maestro assert retries for up to ~17 s) reached the Stop step. The flow
matches the filename pattern `А_С_Пушкин.*`.

`xcrun simctl openurl <UDID> "file://..."` does **not** open the document in
the app and does not populate Recents — seed via the container and open
through the browser UI.

## Voice-Quality Acknowledgement Flow

`voice-quality-acknowledgement.yaml` proves the installed Enhanced/Premium
voice acknowledgement is not a persistent sticker: it asserts the banner on
the first opening, waits for its five-second auto-dismissal, stops the app,
opens the same document again, and asserts the banner is absent.

Run it with the deterministic debug voice catalog and a reset acknowledgement
state. Stop the app before updating its defaults:

```bash
xcrun simctl terminate <UDID> foliotell.FolioTell
xcrun simctl spawn <UDID> defaults write foliotell.FolioTell \
  voiceQualityPreviewMode -string installed
xcrun simctl spawn <UDID> defaults write foliotell.FolioTell \
  acknowledgedInstalledVoiceQualityLanguageCodes -string ""
maestro test foliotell/.maestro/flows/voice-quality-acknowledgement.yaml \
  --device <UDID>
```

The test emits `enhanced-voice-first-open`,
`enhanced-voice-auto-dismissed`, and `enhanced-voice-second-open` screenshots.
The first must contain `voiceQualityBanner`; the latter two must not.

## Synthesized-Input Quirks (iOS 26 document browser)

These hold on iOS 26.3 and 26.4, for both legacy and current builds — they
are environment behavior, not app regressions:

- **Single tap on a document does not open it.** A synthesized single tap on
  a file cell is a no-op (icon view) — use a **double tap** (two `tapOn` point
  commands ~1 s apart) to open.
- **Tapping a file's name label starts rename**, not open. Tap the thumbnail
  or use List View, never the label text in icon view.
- **List View is easier to script** than the icon grid (full-width rows,
  stable y-positions): browser `More` (…) menu → List. The `More` button
  matches `tapOn: "More"`; the List menu item does not match by text — tap it
  by point.
- **Recents does not populate** from in-place container opens on the iOS 26
  simulator; drive the Browse tab instead and account for the browser
  restoring its last location across launches (guard navigation with
  `runFlow`/`when` blocks).
- **The settings menu needs a settle wait** (`waitForAnimationToEnd`,
  ~1500 ms) after opening before its items accept taps; without it, item taps
  (e.g. `1.5x`) silently miss and the menu stays open.
- **Menu-item taps still miss occasionally even after the settle wait** —
  after tapping an item, verify the menu closed (`assertNotVisible: "Auto"`)
  and retry the item tap once if it is still open (`runFlow`/`when visible`).
- **Persisted position and speed survive across runs** (`@AppStorage` +
  position store). For repeat-run determinism the flow resets position via
  Start Over while idle before playing; speed is set explicitly by the flow.

## Verified Control-Cycle Sequence

`playback-controls.yaml` is re-baselined for iOS 26 and self-contained: it
navigates the restored browser state, double-taps the document open, resets
the persisted position (Start Over while idle), then exercises Play → Pause,
the settings menu, 1.5x mid-play without restart, Pause → Resume, and Stop —
verifying each menu interaction landed and retrying once if not. Three
consecutive green runs on the seeded 26.3 simulator is the stability bar it
was validated against.

## Stop / Escalation

- If taps on file cells do nothing in **both** icon and list view after a
  double tap, capture the failure screenshot from
  `~/.maestro/tests/<latest>/` before concluding anything — the browser state
  (tab, folder, view mode) explains most failures.
- If the app itself fails after the document opens (no `Play`), that is an
  app regression, not an environment issue — stop and investigate the build.
