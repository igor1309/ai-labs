---
date: 2026-07-06
model: gpt-5.5-thinking
description: "FolioTell — a native document-to-speech iPhone app that reads local Markdown and plain-text files aloud (working name, implemented v0.0.1 package)"
---

# foliotell

Document-to-speech iPhone app.

## Description

FolioTell opens local Markdown or plain-text files from the system document browser and reads them aloud using Apple speech synthesis, with selectable playback speed. A native, offline, read-only SwiftUI app — *no account, backend, analytics, subscription, or network dependency*. Working name; v0.0.1 is implemented as a Swift package.

## Implementation

- `Package.swift` defines the `FolioTell` executable and `FolioTellCore` library.
- `Sources/App/` contains the SwiftUI `DocumentGroup`, `FileDocument`, reader screen, and `AVSpeechSynthesizer` controller.
- `Sources/Core/` contains testable document validation/loading and speech speed mapping.
- `Tests/Core/` covers supported document loading, error cases, and speed presets.
- `FolioTell.xcodeproj` wraps the same sources as an archive-ready iOS app for bundle id `foliotell.FolioTell` on Apple team `VRVJ9YNRQU`.

## Release Unit

FolioTell is a release unit with canonical version metadata in `release.toml`. Release tags use the repo standard:

```text
foliotell_v<version>
```

Pushing a matching release tag triggers the repo release workflow, runs FolioTell's Swift build/test/archive gates on macOS, and uploads the signed build to TestFlight under Apple team `VRVJ9YNRQU`.

## Distribution Script

Use `scripts/distribute-testflight.sh` to archive, export, and upload a TestFlight build locally or from the release workflow. The script refuses any Apple team or provider other than `VRVJ9YNRQU`.

Local upload credentials:

- `FOLIOTELL_ASC_API_KEY_ID` or `ASC_API_KEY_ID`
- `FOLIOTELL_ASC_API_ISSUER_ID` or `ASC_API_ISSUER_ID`
- `FOLIOTELL_ASC_API_KEY_PATH` or `ASC_API_KEY_PATH`

GitHub release workflow secrets:

- `FOLIOTELL_ASC_API_KEY_ID`
- `FOLIOTELL_ASC_API_ISSUER_ID`
- `FOLIOTELL_ASC_API_PRIVATE_KEY`

Optional release metadata:

- `FOLIOTELL_VERSION` defaults to the version in `release.toml`
- `FOLIOTELL_BUILD_NUMBER` defaults to the git commit count

Run `scripts/distribute-testflight.sh --help` for modes including `--validate-only`, `--archive-only`, and `--dry-run`.

## Docs

Specs (`docs/specs/`, implemented specs move to `docs/specs/implemented/`):

- [Technical specification](docs/specs/foliotell-technical-spec.md) — v0.0.1 and v0.0.2 scope, document support, reader screen, speech, and acceptance criteria.

Living references:

- [Device speech](docs/device-speech.md) — design rationale, per-release hypothesis ledger, and diagnostic runbook for device-only audio behavior.
- [Release runbook](docs/release-runbook.md) — exact release commands, gates, caveats (runner Xcode variance, altool flags), and tag-recovery procedure.
- [Release notes](docs/releases/) — versioned, checked-in GitHub Release bodies.
- [App Store Connect product card](docs/app-store-connect-product-card.md) — backed-up app information, version metadata, and API update limitations.

Briefs (`docs/`):

- [Naming brief](docs/foliotell-naming-brief.md) — product scope, naming objective, scoring model, and availability standard.
- [Android roadmap](docs/foliotell-android-roadmap.md) — settled decisions and staged milestones (family refactor/scaffold, app, distribution, CI/CD lock) for a sibling Android app.

Intake briefs (`docs/intake/`, pre-planning context capture per task):

- [Speech text normalization](docs/intake/speech-normalization-intake.md)
- [Stop latency on device](docs/intake/stop-latency-intake.md)

Research (`research/`, plus the UI reference corpus):

- [Candidate evaluation](research/foliotell-candidate-evaluation.md) — weighted comparison of candidate names.

## Pages

- Internal orientation: [index.html](index.html) — thesis, v0.0.1 scope, naming direction, non-goals, and a doc hub.
- Public landing: [landing/index.html](landing/index.html) — the App Store marketing page, with a [privacy policy](landing/privacy.html).

## Stack

- SwiftUI
- AVSpeechSynthesizer
- Swift Package Manager
- Naming
- Spec
