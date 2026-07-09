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

Any BOM-prefixed front-matter Markdown with a few Russian sentences works;
the flow matches the filename pattern `А_С_Пушкин.*`.

`xcrun simctl openurl <UDID> "file://..."` does **not** open the document in
the app and does not populate Recents — seed via the container and open
through the browser UI.

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

## Verified Control-Cycle Sequence

The behavioral payload of `playback-controls.yaml` (everything after
document-open) passes verbatim on the refactored app once the document is
open: Play → Pause visible; settings menu → Auto visible; 1.5x mid-play →
still Pause (no restart); Pause → Resume → Pause; Stop → Play. A mirrored
flow with the double-tap open and settle waits is the working template for
re-baselining the checked-in flow for iOS 26.

## Stop / Escalation

- If taps on file cells do nothing in **both** icon and list view after a
  double tap, capture the failure screenshot from
  `~/.maestro/tests/<latest>/` before concluding anything — the browser state
  (tab, folder, view mode) explains most failures.
- If the app itself fails after the document opens (no `Play`), that is an
  app regression, not an environment issue — stop and investigate the build.
