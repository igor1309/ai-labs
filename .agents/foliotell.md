---
date: 2026-07-08
model: claude-fable-5
description: "FolioTell-specific build rules — dual SPM/Xcode-project build and pbxproj registration"
---

# FolioTell Build Rules

## Dual build: SPM package + Xcode project wrapper

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
