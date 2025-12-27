---
date: 2025-12-05
model: codex
description: "Steps and checks for adding a new feature flag in Vortex."
---

# Feature Flag Implementation Guide

## 1. Prerequisite
1. Request the feature flag identity **before** writing any code. That means asking for the exact Swift type name (e.g., `CaptchaFlag`) and the Settings `Title` (e.g., `Капча`). Record those values so the entire team — code, backend key, and `Settings.bundle/FeatureToggles.plist` — stays in sync.
2. Confirm the backend key that will carry the flag value (it usually matches the Settings key such as `captcha`). Knowing this key lets you wire the loader and the manual toggle ahead of time.

## 2. Anatomy (Captcha as a reference)
- `CaptchaFlag` lives in `Flags/CaptchaFlag.swift` as `typealias CaptchaFlag = Tagged<_CaptchaFlag, FeatureFlag>`, so it gains `.active`/`.inactive` helpers and enforces type safety for consumers.
- `FeatureFlags` now exposes `let captcha: CaptchaFlag`, ensuring every consumer receives the flag bundle (`FeatureFlags.swift`).
- The loader maps `FeatureFlagKey.captcha` to `.active` when the retrieved value is `"1"` and `.inactive` otherwise (`FeatureFlagsLoader.swift`).
- The Settings toggle uses the same key (`captcha`) with title `Капча` so developers can flip the value locally (`Settings.bundle/FeatureToggles.plist`).
- Consumers such as `RootViewModelFactory` read `featureFlags.captcha` and choose between behavior variants (default vs. `OrderProductSubstitutingAuthLoginViewModelFactory`) depending on `.isActive` (`RootViewModelFactory+makeAuthLoginViewModelFactory.swift`).

## 3. Step-by-step checklist
1. **Add the typed alias.** Create `Flags/NewFlag.swift` containing `typealias NewFlag = Tagged<_NewFlag, FeatureFlag>` and `enum _NewFlag { }` so the general helpers are available.
2. **Include it in `FeatureFlags`.** Add a stored property for `NewFlag` (keep alphabetical order).
3. **Update the loader.** Add a case to `FeatureFlagKey` whose `rawValue` matches the backend/settings key; add `loadNewFlag()` returning `.active` on `"1"`; and include it when constructing `FeatureFlags` in `load()`.
4. **Expose the toggle.** Add a `PSToggleSwitchSpecifier` entry to `Settings.bundle/FeatureToggles.plist` with the agreed key and title, matching the `FeatureFlagKey` case.
5. **Update SceneDelegate.** Add the new flag to the `featureFlags` lazy property initialization (pass through from loaded flags or override as needed).
6. **Update test helpers:**
   - `VortexTests/TestHelpers/FeatureFlags+active.swift` — add parameter to `activeExcept(...)` and include in the returned `.init(...)`.
   - `VortexTests/CompositionRoot/FeatureFlags/FeatureFlagsLoaderTests.swift` — add `newFlag` parameter to `makeFeatureFlags(...)` helper.
   - `VortexTests/CompositionRoot/RootViewModelFactory/RootViewModelFactory+makeTests.swift` — add `newFlag` to `makeFeatureFlagsStub()`.
7. **Write focused tests.** Extend `FeatureFlagsLoaderTests` to cover the new key with active/inactive cases (copy the Captcha tests pattern).
8. **Use the flag in the app.** Replace direct checks with `featureFlags.newFlag.isActive`, mirroring how the Captcha flag controls the login-product substitution (`RootViewModelFactory`).

## 4. Running tests

**IMPORTANT:** Before running tests, ask the user to add the new flag file (`Flags/NewFlag.swift`) to the Xcode project. Files created on disk are not automatically added to the project and will cause "cannot find type" compilation errors.

These tests require iOS Simulator (not Mac) due to UIKit dependencies.

### Find an available simulator

```bash
xcrun simctl list devices available | grep -E "iPhone|iPad" | head -10
```

### Run tests

Run from the `Vortex` directory (where `Vortex.xcodeproj` is located):

```bash
cd Vortex && xcodebuild test \
  -scheme Vortex-Tests \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro Max' \
  -only-testing:VortexTests/FeatureFlagsLoaderTests \
  -quiet \
  2>&1 | xcpretty -s
```

Key parameters:
- `-scheme Vortex-Tests` — the test scheme
- `-destination 'platform=iOS Simulator,name=...'` — forces iOS Simulator by name (e.g., `iPhone 16 Pro Max`)
- `-destination 'platform=iOS Simulator,id=...'` — alternative: use simulator UUID from `xcrun simctl list`
- `-only-testing:VortexTests/TestClassName` — runs specific test class
- `-only-testing:VortexTests/TestClassName/testMethodName` — runs specific test method
- `-quiet` — suppresses xcodebuild verbose output
- `| xcpretty -s` — simple output (shows only failures)

## 5. Final verification
- Running the loader tests ensures the new key is parsed correctly.
- Manual toggling via Settings proves the switch can be flipped without redeploying.
- If you added UI/flow changes, cover them with the appropriate view-model tests.
- Keep the prerequisite information (flag name/title) documented for future reference so no one leaps ahead without consensus.
