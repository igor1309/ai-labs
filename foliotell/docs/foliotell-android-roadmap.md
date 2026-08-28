---
date: 2026-07-12
author: Igor Malyarov
title: FolioTell Android — Staged Roadmap
status: draft
---

# FolioTell Android — Staged Roadmap

Staged milestones for bringing FolioTell to Android. This is a roadmap, not a
spec or an implementation plan: each stage gets its own spec (per the
`spec-writing` skill) and implementation plan (per the `implementation-plan`
skill) when it starts. The stages define scope boundaries and done criteria so
each one ships independently.

## Product frame

The iOS product promise carries over unchanged: a native, offline, read-only
document-to-speech app — open local Markdown or plain-text files and listen to
them with selectable playback speed. No account, backend, analytics,
subscription, or network dependency. The Android app is a sibling product, not
a port of the iOS codebase: no shared code, no cross-platform framework.

Reference points on the iOS side:

- Core scope: `ios/docs/specs/foliotell-technical-spec.md` (v0.0.1/v0.0.2) —
  the Stage 1 parity target.
- Distribution/CI shape to mirror: `ios/release.toml`,
  `ios/docs/release-runbook.md`, and the `foliotell` jobs in
  `.github/workflows/release-unit.yml`.
- Device-behavior discipline to replicate: `ios/docs/device-speech.md` —
  Android TTS will need its own hypothesis ledger.

## Decisions (settled 2026-07-12)

1. **Stack:** native Kotlin + Jetpack Compose + platform
   `android.speech.tts.TextToSpeech`. Recorded in
   [ADR-003](adr/adr-003-android-native-stack-and-family-placement.md).
2. **Repo placement:** refactor `foliotell/` into a platform-family directory
   first (iOS app moves to `foliotell/ios/`), then Android lands as
   `foliotell/android/`. This follows the existing `notio/` precedent —
   nested release units per `{ path = "notio/backend", basename =
   "notio-backend" }` — rather than a new top-level dir. Recorded in
   [ADR-003](adr/adr-003-android-native-stack-and-family-placement.md); see
   the Stage 0 pre-task below.
3. **Application id:** `dev.igor1309.foliotell`. Permanent once the first
   build is uploaded.
4. **Play account:** the existing personal Google Play developer account.
5. **Signing:** Play App Signing — Google holds the app signing key, the repo
   side holds only an upload keystore.
6. **Versioning:** independent of iOS, starting at `0.0.1`, tag namespace
   `foliotell-android_v*`.
7. **Module layout:** two Gradle modules — `:core` pure-JVM and
   unit-testable, `:app` for Compose/TTS — mirroring the
   `FolioTellCore`/`App` split.
8. **API floor:** high, no legacy — `minSdk` tracks current Android.
   Finalized 2026-07-13: `minSdk = 35` (Android 15) — OS releases older
   than two years are unsupported. There are no physical Android test
   devices; acceptance runs on the emulator until a device is available.
9. **Privacy policy:** one platform-neutral policy at the existing
   `https://foliotell.pages.dev/privacy` URL, referenced by both stores.

## Stage 0 — Family refactor and scaffold

### Pre-task: platform-family refactor (own PR, between releases)

Restructure `foliotell/` on the `notio/` family model before any Android code
lands:

- Move the iOS app into `foliotell/ios/`: `Package.swift`, `Sources/`,
  `Tests/`, `App/`, `Config/`, `FolioTell.xcodeproj`, `scripts/`,
  `release.toml`, and iOS-specific docs (`device-speech.md`,
  `release-runbook.md`, `releases/`, `specs/`, `adr/`, `plans/`, `intake/`).
- Keep at family level: `README.md`, `index.html`, `landing/` (source of the
  published `foliotell.pages.dev` site — moving it would touch the Pages
  deploy and the App-Store-referenced privacy URL, for no benefit), the
  product backlog, and family docs (naming brief, product intent, this
  roadmap, `docs/log.md`; per-platform logs can split later if churn demands).
- Update path references, all verified touchpoints:
  - `release-units.config.toml`: `"foliotell"` → `{ path = "foliotell/ios",
    basename = "foliotell" }`; regenerate `release-units.toml`.
  - `.github/workflows/foliotell-core.yml`: `working-directory` entries and
    path filters.
  - `.github/workflows/release-unit.yml`: `working-directory: foliotell` in
    the `test-foliotell` and `deploy-foliotell-testflight` jobs, and the
    `foliotell/docs/releases/<version>.md` release-notes path.
  - `scripts/release/validate-foliotell-release-notes.js`: hardcoded
    `foliotell/release.toml` and `foliotell/docs/releases/` paths.
- Unchanged by design: the top-level dir set (so `loc-dashboard.sh` known
  list stays as-is; the single `foliotell` dashboard row keeps covering the
  family until a per-platform split is wanted), the `foliotell_v*` tag
  namespace, and all published URLs.
- Gate: full root suite green plus a `--validate-only`/dry-run pass of the
  release-notes validator and distribute script from the new paths. Ships on
  the roadmap branch/PR together with the Stage 0 docs (one branch, one PR),
  with no product changes mixed in.

### Scaffold

- Record the stack and placement decisions (items 1–2 above) in an ADR under
  the family docs.
- Land the `foliotell/android/` skeleton: two Gradle modules per decision 7,
  building with a near-empty test suite.
- Dedicated `foliotell-android-core.yml` workflow on Linux runners,
  path-filtered to `foliotell/android/**`, per
  `.agents/per-project-ci-isolation.md`.
- No new top-level dir, so the new-project checklist applies only partially:
  no `loc-dashboard.sh` known-list change; add the `foliotell-android` row to
  the README `## Components` table when the unit lands (mirroring the
  `notio-backend`/`notio-frontend` rows).

Done criteria:

- Refactor PR merged with the iOS release pipeline verified from the new
  paths.
- ADR merged; skeleton builds and its test suite runs green in
  `foliotell-android-core.yml`.

## Stage 1 — The app

Parity with the iOS technical spec's core scope (not with v0.6.x), on Android
idioms:

- Open local `.md` / `.markdown` / `.txt` files via the system document picker
  (Storage Access Framework, `ACTION_OPEN_DOCUMENT`); treat Markdown as plain
  UTF-8 text, read-only.
- Reader screen: filename, Play, Pause/Resume, Stop, speed presets (1× /
  1.25× / 1.5× / 1.75× / 2×).
- Speech via the platform `TextToSpeech` engine with on-device system voices;
  document validation/loading and central speed-preset mapping live in the
  pure-JVM `:core` module (decision 7).
- `minSdk`/`targetSdk` per decision 8: `35` (Android 15), no legacy support
  burden — OS releases older than two years are unsupported.
- Fully offline; no permissions beyond what SAF grants per document.

Explicitly deferred past this stage (they are iOS v0.1+–v0.6 features, tracked
in `backlog/product.md` terms once the core is trustworthy): per-document
playback position, word/sentence highlighting, front-matter skip/read, voice
picker and language-aware voice selection, background/lock-screen playback.

Known risk to budget for: Android TTS engine variance. Unlike
`AVSpeechSynthesizer`, the installed engine differs per OEM (Google TTS,
Samsung TTS, …) and voice/language availability is not guaranteed. With no
physical device on hand (decision 8), the emulator's Google TTS is the
Stage 1 acceptance gate; per-OEM engine behavior stays an open risk until a
real device is available — start the Android equivalent of the iOS
device-speech hypothesis ledger at that first device test.

Done criteria:

- `:core` unit tests cover document loading/validation errors and speed
  mapping; suite green in `foliotell-android-core.yml`.
- App runs on an emulator: open a Markdown file, play, pause/resume, stop,
  change speed. (Real-device validation is deferred until a device is
  available — none exists; see decision 8.)
- A debug APK is buildable from a clean checkout with documented commands.

## Stage 2 — Distribution

Get builds onto real devices through Play's TestFlight analog: the **internal
testing track**.

- Create the app record under the existing personal Play developer account
  (decision 4) with application id `dev.igor1309.foliotell` (decision 3).
- Signing per decision 5: enroll in Play App Signing; generate and store the
  upload keystore. The keystore and its passwords become repo secrets in
  Stage 3 — until then they live only in the local signing setup.
- Store listing minimum for internal testing: the shared platform-neutral
  privacy policy at `foliotell.pages.dev/privacy` (decision 9 — make the
  wording platform-neutral if it is iOS-specific today) and the Data safety
  form — trivially "no data collected" given the product promise, and that
  promise must keep holding.
- First upload of a signed AAB is manual via the Console (required before API
  uploads work); subsequent uploads may stay manual in this stage.
- Create the Play API service account and grant it release access — this is
  the credential Stage 3 automates with, so it's provisioned and smoke-tested
  here (one scripted upload, the analog of
  `ios/scripts/distribute-testflight.sh`).

Production rollout is out of scope for this stage; note that personal Play
accounts carry extra testing requirements before production access, which is
another reason the internal track is the target.

Done criteria:

- A signed release build installs from the internal testing track on a real
  device and passes the Stage 1 manual acceptance flow.
- A local script (mirroring `distribute-testflight.sh`'s role: build, sign,
  upload, `--dry-run`/`--validate-only` modes) performs an upload using the
  service-account credential.
- Account, signing, and credential facts captured in a distribution doc so a
  fresh session can repeat the upload without re-derivation.

## Stage 3 — Lock CI/CD

Fold the Stage 2 manual pipeline into the repo's release-unit machinery, the
way FolioTell iOS releases run today.

- Register the release unit: `{ path = "foliotell/android", basename =
  "foliotell-android" }` in `release-units.config.toml`, regenerate
  `release-units.toml`, add `foliotell/android/release.toml`. Tags:
  `foliotell-android_v<version>`, versioned independently of iOS from `0.0.1`
  (decision 6).
- Extend `.github/workflows/release-unit.yml` with the Android analogs of the
  FolioTell jobs: a `test-foliotell-android` job (Gradle build + tests +
  release AAB on Linux runners — no macOS runner needed) and a
  `deploy-foliotell-android-play` job uploading to the internal track via the
  Stage 2 service account; wire both into the `github-release` gates the same
  way `test-foliotell`/`deploy-foliotell-testflight` are.
- Repo secrets: upload keystore (base64), keystore/key passwords, Play
  service-account JSON — named with a `FOLIOTELL_ANDROID_` prefix, mirroring
  the `FOLIOTELL_ASC_*` convention.
- Versioned release notes under the unit's `docs/releases/` with the same CI
  validation the iOS unit has.
- Write the unit's release runbook (mirroring the iOS
  `docs/release-runbook.md`) so routine releases are
  `release-executor`-delegable.

Done criteria:

- Pushing a `foliotell-android_v<version>` tag runs `verify`, the Android
  test/build job, the Play upload job, and `github-release` to green, and the
  build appears on the internal testing track.
- Release runbook exists and a release has been executed from it.

## Sequencing rationale

CI splits across the stages deliberately: build/test CI locks in Stage 0/1
(per-project workflow, cheap on Linux runners) so the app is never developed
without a gate, while CD locks last — Stage 3 only automates a distribution
path Stage 2 has already proven manually. This mirrors how the iOS unit
evolved (local distribute script first, release-unit workflow after).

## Non-goals

- Code sharing with the iOS app or a cross-platform rewrite of either side.
- Production (public) Play rollout — a later decision after internal-track
  releases are routine.
- Feature parity with iOS v0.6.x in Stage 1; parity items queue behind a
  trustworthy core, as they did on iOS.
