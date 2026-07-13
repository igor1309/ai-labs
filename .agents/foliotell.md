---
date: 2026-07-13
model: claude-fable-5
description: "FolioTell-specific build rules — iOS dual SPM/Xcode-project build and pbxproj registration; Android Gradle layout and sandbox build constraints"
---

# FolioTell Build Rules

`foliotell/` is a platform family: iOS app in `ios/`, Android sibling in
`android/`. Plan of record for Android work: the roadmap
(`foliotell/docs/foliotell-android-roadmap.md`) and ADR-003
(`foliotell/docs/adr/adr-003-android-native-stack-and-family-placement.md`).

## iOS dual build: SPM package + Xcode project wrapper

FolioTell builds twice: the SPM package (`foliotell/ios/Package.swift`, exercised
by `swift build` / `swift test`) and an archive-ready Xcode project wrapper
(`foliotell/ios/FolioTell.xcodeproj`) that compiles the same sources as a single
target with `FOLIOTELL_SINGLE_TARGET` defined. The `foliotell-core / core` CI
job runs `xcodebuild archive` against the wrapper, so local `swift test`
green does not prove CI green.

When adding, renaming, or deleting a Swift source under `foliotell/ios/Sources/`,
also update `FolioTell.xcodeproj/project.pbxproj` in all four sections —
PBXBuildFile, PBXFileReference, the group children, and the sources build
phase (synthetic UUID scheme `A1…000X` / `A1…002X`). A file missing from the
wrapper fails the archive with "cannot find X in scope" (see PR #717).

Verify locally with the CI command:

```bash
cd foliotell/ios
xcodebuild archive \
  -project FolioTell.xcodeproj \
  -scheme FolioTell \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath /tmp/FolioTell.xcarchive \
  CODE_SIGNING_ALLOWED=NO \
  DEVELOPMENT_TEAM=VRVJ9YNRQU \
  PRODUCT_BUNDLE_IDENTIFIER=foliotell.FolioTell
```

## Android build (`foliotell/android/`)

Two Gradle modules per ADR-003: `:core` (pure JVM, unit-testable) and `:app`
(Compose/TTS). CI (`foliotell-android-core.yml`, ubuntu) runs:

```bash
cd foliotell/android
./gradlew :core:test
./gradlew :app:assembleDebug
```

A clean checkout needs nothing beyond a JDK (CI uses 21) and network access
to Google Maven/Maven Central; `:app:assembleDebug` writes the installable
debug APK to `app/build/outputs/apk/debug/app-debug.apk`.

### Restricted sandboxes (Claude Code remote)

The sandbox network policy blocks `dl.google.com`, which is the only host for
AGP and androidx artifacts (Google Maven), and the Gradle distribution
download chain (`services.gradle.org` → `objects.githubusercontent.com`).
Consequences:

- `./gradlew` cannot download its distribution there; use the preinstalled
  system `gradle` (pinned to the same version as the wrapper).
- Only the pure-JVM core builds locally (Maven Central is reachable):

  ```bash
  cd foliotell/android
  gradle :core:test -PskipAndroidApp=true
  ```

  The `:app` gate then runs in CI — a green local core does not prove the
  Compose app builds.
- To enable full local Android builds, add `dl.google.com`,
  `services.gradle.org`, and `objects.githubusercontent.com` to the
  environment's allowed domains (Claude Code environment settings).

### No root build script — deliberate

Each module declares its own plugins from the version catalog; there is no
root `build.gradle.kts` and one MUST NOT be added as a "cleanup". A root
`apply false` plugins block either puts AGP on the root classpath
(unresolvable in the sandboxes above) or puts the Kotlin plugin classes on
the parent classpath, which fails `:app`'s versioned
`org.jetbrains.kotlin.android` request in CI with "plugin is already on the
classpath with an unknown version" (PR #766, first run).
