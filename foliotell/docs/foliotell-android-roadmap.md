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

- Core scope: `docs/specs/foliotell-technical-spec.md` (v0.0.1/v0.0.2) — the
  Stage 1 parity target.
- Distribution/CI shape to mirror: `release.toml`, `docs/release-runbook.md`,
  and the `foliotell` jobs in `.github/workflows/release-unit.yml`.
- Device-behavior discipline to replicate: `docs/device-speech.md` — Android
  TTS will need its own hypothesis ledger.

## Stage 0 — Decisions and scaffold

Settle the choices every later stage depends on, then land an empty-but-green
project skeleton.

Decisions to record (each with a lean, finalized at stage start):

- **Stack.** Lean: native Kotlin + Jetpack Compose +
  `android.speech.tts.TextToSpeech`. Mirrors the iOS choice of the native
  platform stack and on-device system voices; KMP/Flutter would contradict the
  "sibling product, no shared code" frame and add a toolchain the repo doesn't
  have. Worth an ADR since it's load-bearing for everything after.
- **Repo placement.** Lean: new top-level `foliotell-android/` directory. It
  has its own toolchain and dependencies (Gradle/JDK/Android SDK), so
  per-project CI isolation (`.agents/per-project-ci-isolation.md`) wants a
  dedicated workflow, and release units are cleanest per top-level dir. The
  full new-project checklist (`.agents/new-project-checklist.md`) applies:
  `loc-dashboard.sh` known list + row, README `## Components` row,
  `docs/loc-dashboard.html` card, seeded project log, root log entry.
- **Application id.** The iOS bundle id (`foliotell.FolioTell`) is not a
  template; Play needs a proper reverse-DNS id (e.g. `dev.igor1309.foliotell`)
  that is permanent once the first build is uploaded. Decide before Stage 2.

Done criteria:

- Stack and placement ADR merged.
- Project skeleton builds and its (near-empty) test suite runs in a dedicated
  `foliotell-android-core.yml` workflow on Linux runners, path-filtered to the
  project dir.
- New-project checklist items landed in the same change set.

## Stage 1 — The app

Parity with the iOS technical spec's core scope (not with v0.6.x), on Android
idioms:

- Open local `.md` / `.markdown` / `.txt` files via the system document picker
  (Storage Access Framework, `ACTION_OPEN_DOCUMENT`); treat Markdown as plain
  UTF-8 text, read-only.
- Reader screen: filename, Play, Pause/Resume, Stop, speed presets (1× /
  1.25× / 1.5× / 1.75× / 2×).
- Speech via the platform `TextToSpeech` engine with on-device system voices;
  central speed-preset mapping, mirroring `FolioTellCore`'s testable core
  (document validation/loading, speed mapping) as a plain Kotlin module.
- Fully offline; no permissions beyond what SAF grants per document.

Explicitly deferred past this stage (they are iOS v0.1+–v0.6 features, tracked
in `backlog/product.md` terms once the core is trustworthy): per-document
playback position, word/sentence highlighting, front-matter skip/read, voice
picker and language-aware voice selection, background/lock-screen playback.

Known risk to budget for: Android TTS engine variance. Unlike
`AVSpeechSynthesizer`, the installed engine differs per OEM (Google TTS,
Samsung TTS, …) and voice/language availability is not guaranteed. Real-device
behavior is the acceptance gate, same as the iOS device-speech discipline;
start an Android equivalent of the hypothesis ledger at first device test.

Done criteria:

- Core-module unit tests cover document loading/validation errors and speed
  mapping; suite green in `foliotell-android-core.yml`.
- App runs on an emulator and at least one physical device: open a Markdown
  file, play, pause/resume, stop, change speed.
- A debug APK is buildable from a clean checkout with documented commands.

## Stage 2 — Distribution

Get builds onto real devices through Play's TestFlight analog: the **internal
testing track**.

- Google Play Console developer account (one-time registration); create the
  app record with the Stage 0 application id.
- Signing: enroll in Play App Signing; generate and store the upload keystore.
  The keystore and its passwords become repo secrets in Stage 3 — until then
  they live only in the local signing setup.
- Store listing minimum for internal testing: privacy policy URL (extend the
  existing `landing/privacy.html` or publish an Android-inclusive variant) and
  the Data safety form — trivially "no data collected" given the product
  promise, and that promise must keep holding.
- First upload of a signed AAB is manual via the Console (required before API
  uploads work); subsequent uploads may stay manual in this stage.
- Create the Play API service account and grant it release access — this is
  the credential Stage 3 automates with, so it's provisioned and smoke-tested
  here (one scripted upload, the analog of
  `scripts/distribute-testflight.sh`).

Production rollout is out of scope for this stage; note that new personal Play
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

- Register the release unit: `foliotell-android` basename in
  `release-units.config.toml`, regenerate `release-units.toml`, add
  `<project>/release.toml`. Tags: `foliotell-android_v<version>`.
- Extend `.github/workflows/release-unit.yml` with the Android analogs of the
  FolioTell jobs: a `test-foliotell-android` job (Gradle build + tests +
  release AAB on Linux runners — no macOS runner needed) and a
  `deploy-foliotell-android-play` job uploading to the internal track via the
  Stage 2 service account; wire both into the `github-release` gates the same
  way `test-foliotell`/`deploy-foliotell-testflight` are.
- Repo secrets: upload keystore (base64), keystore/key passwords, Play
  service-account JSON — named with a `FOLIOTELL_ANDROID_` prefix, mirroring
  the `FOLIOTELL_ASC_*` convention.
- Versioned release notes under the project's `docs/releases/` with the same
  CI validation the iOS unit has.
- Write the unit's release runbook (mirroring `docs/release-runbook.md`) so
  routine releases are `release-executor`-delegable.

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
