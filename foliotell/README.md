---
date: 2026-07-06
model: gpt-5.5-thinking
description: "FolioTell — a native document-to-speech iPhone app that reads local Markdown and plain-text files aloud (working name, implemented v0.0.1 package)"
---

# foliotell

Orientation surface: [index.html](index.html) — a single internal page for FolioTell (thesis, v0.0.1 scope, naming direction, non-goals, and a doc hub).

Document-to-speech iPhone app.

## Description

FolioTell opens local Markdown or plain-text files from the system document browser and reads them aloud using Apple speech synthesis, with selectable playback speed. A native, offline, read-only SwiftUI app — *no account, backend, analytics, subscription, or network dependency*. Working name; v0.0.1 is implemented as a Swift package.

## Implementation

- `Package.swift` defines the `FolioTell` executable and `FolioTellCore` library.
- `Sources/App/` contains the SwiftUI `DocumentGroup`, `FileDocument`, reader screen, and `AVSpeechSynthesizer` controller.
- `Sources/Core/` contains testable document validation/loading and speech speed mapping.
- `Tests/Core/` covers supported document loading, error cases, and speed presets.

## Docs

- [Naming brief](docs/foliotell-naming-brief.md) — product scope, naming objective, scoring model, and availability standard.
- [Candidate evaluation](docs/foliotell-candidate-evaluation.md) — weighted comparison of candidate names.
- [Technical specification](docs/foliotell-technical-spec.md) — v0.0.1 and v0.0.2 scope, document support, reader screen, speech, and acceptance criteria.

## Stack

- SwiftUI
- AVSpeechSynthesizer
- Swift Package Manager
- Naming
- Spec
