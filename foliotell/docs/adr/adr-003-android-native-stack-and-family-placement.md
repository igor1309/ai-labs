---
date: 2026-07-12
author: Igor Malyarov
description: "Decision on the FolioTell Android sibling: native Kotlin/Compose with platform TextToSpeech, developed as an independent nested unit in the foliotell/ platform-family directory."
status: accepted
---

# ADR-003 — Android Sibling: Native Stack and Family Placement

## Executive Summary

The Android version of FolioTell is a native Kotlin + Jetpack Compose app
using the platform `android.speech.tts.TextToSpeech` engine, developed as an
independent sibling of the iOS app — no shared code, no cross-platform
framework. It lives at `foliotell/android/` inside the `foliotell/`
platform-family directory (iOS at `foliotell/ios/`), registered as its own
nested release unit on the `notio/` model. Scope: technology stack and repo
placement only; product scope, milestones, and distribution belong to the
[Android roadmap](../foliotell-android-roadmap.md).

## Context

FolioTell's product promise is a native, offline, read-only document-to-speech
app with no account, backend, analytics, or network dependency. The iOS app
honors it with the native platform stack (SwiftUI + `AVSpeechSynthesizer`,
zero third-party dependencies). An Android version must hold the same promise,
and the repo needs a placement that keeps two platform toolchains (SwiftPM/
Xcode vs Gradle/Android SDK) from tangling each other's CI and release paths.
The repo already solves multi-unit placement once: `notio/` is a family
directory whose `backend/` and `frontend/` are separate nested release units
with dedicated per-project CI workflows.

Rejected alternatives:

- **Kotlin Multiplatform sharing the core with iOS.** The shareable logic
  (document validation/loading, speed mapping) is a few hundred lines; KMP's
  toolchain and build-integration cost buys almost nothing, and it couples two
  codebases that ship on independent schedules.
- **Flutter or another cross-platform framework.** Contradicts the native
  promise both apps are built on, adds a third toolchain the repo doesn't
  have, and replaces the platform TTS/document-picker idioms this product is
  entirely made of.
- **A non-platform TTS engine as the baseline.** On-device neural TTS is an
  open evaluation in the product backlog with an unresolved feasibility gate
  (timing/highlighting reconstruction); the platform engine is the proven
  baseline, as `AVSpeechSynthesizer` is on iOS.
- **A new top-level `foliotell-android/` directory.** Scatters one product
  across two top-level dirs, against the `notio/` precedent; the family
  directory keeps product-level assets (landing page, backlog, research,
  naming) shared naturally.
- **`foliotell/android/` without first moving iOS to `foliotell/ios/`.**
  Leaves Gradle inside a Swift package root, and the pre-existing
  `foliotell/**`-shaped CI filters would fire iOS jobs on Android changes.
  The family refactor (executed 2026-07-12) removed this hazard first.

## Decision

The Android FolioTell app is implemented natively in Kotlin with Jetpack
Compose for UI and the platform `android.speech.tts.TextToSpeech` engine with
on-device system voices for speech. It is developed at `foliotell/android/`
as an independent release unit, sibling to the iOS app at `foliotell/ios/`,
sharing no source code with it.

## Rules / Invariants

- Android app code MUST live under `foliotell/android/`; iOS app code MUST
  live under `foliotell/ios/`.
- The two platform apps MUST NOT share source code, build configuration, or a
  common compiled module. Shared product assets (landing page, backlog,
  research, family docs) live at the `foliotell/` family level.
- The Android unit MUST be registered in `release-units.config.toml` as
  `{ path = "foliotell/android", basename = "foliotell-android" }`; its tags
  use the `foliotell-android_v<version>` namespace. The iOS unit keeps
  `foliotell_v*`.
- The Android build MUST be two Gradle modules: `:core` (pure JVM,
  unit-testable, owning document validation/loading and speed mapping) and
  `:app` (Compose UI, TTS, SAF integration) — mirroring the
  `FolioTellCore`/`App` split.
- Android CI MUST be a dedicated `foliotell-android-core.yml` workflow
  path-filtered to `foliotell/android/**`, per per-project CI isolation.
  Android steps MUST NOT be added to `foliotell-core.yml`, and vice versa.
- Speech synthesis and voices MUST remain fully on-device. Adopting a
  cross-platform framework, a shared-code module, or a non-platform TTS
  engine as the baseline requires superseding this ADR.

## Consequences

- Two codebases implement the product twice; parity is maintained by shared
  product intent and specs, not by shared code. Accepted for platform
  fidelity and independent release cadence.
- Android CI runs on Linux runners — cheaper and faster than the macOS
  runners the iOS unit requires.
- The single `foliotell` LOC-dashboard row now covers both platforms; a
  per-platform split is a future option, not required by this ADR.
- FolioTell ADR numbering continues family-wide: ADR-001/002 are iOS-scoped
  and live in `ios/docs/adr/`; family-level ADRs (this one onward) live in
  `docs/adr/` at the family level.
- Platform TTS engine variance across Android OEMs becomes a product risk to
  manage with a device-evidence ledger (the Android analog of
  `ios/docs/device-speech.md`), not an architecture problem.

## Non-Goals

- Product feature scope, milestones, and sequencing — owned by the
  [Android roadmap](../foliotell-android-roadmap.md).
- Distribution decisions (Play account, signing, application id, tracks) —
  roadmap Stage 2.
- Versioning policy and API floor — roadmap decisions 6 and 8.
- Any mandate for other repo products to adopt family directories; `notio/`
  and `foliotell/` are precedents, not a repo-wide rule.
- Any position on future on-device neural TTS — that evaluation stays in the
  product backlog and would supersede or extend this ADR only if adopted.
