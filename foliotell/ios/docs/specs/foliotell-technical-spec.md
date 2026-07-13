---
date: 2026-07-06
author: Igor Malyarov
model: gpt-5.5-thinking
title: FolioTell — Technical Specification
version: 0.0.1
status: draft
---

# Markdown Text-to-Speech Reader — Technical Specification

## v0.0.1

### Goal

Build a native document-based iPhone app for opening Markdown or plain-text files and listening to them using Apple speech synthesis.

The system document browser is the app’s entry screen.

### Document support

Support read-only opening of:

- `.md`
- `.markdown`
- `.txt`

Treat Markdown as plain UTF-8 text.

Use SwiftUI `DocumentGroup(viewing:)` with a `FileDocument` implementation.

### Reader screen

Display:

- Document filename
- Play
- Pause / Resume
- Stop
- Speed selector:
  - 1×
  - 1.25×
  - 1.5×
  - 1.75×
  - 2×

Returning from the reader must return to the same document-browser location.

### Speech

Use:

- `AVSpeechSynthesizer`
- `AVSpeechUtterance`
- Apple system voices

Map speed presets centrally to `AVSpeechUtterance.rate`.

Changing speed may restart playback from the beginning in v0.0.1.

### State

Track:

```text
document
selectedSpeed
playbackState
error
```

Playback states:

```text
idle
speaking
paused
```

Persist selected speed using `AppStorage`.

### Error handling

Present a concise error for:

- unreadable file;
- unsupported text encoding;
- empty document;
- speech synthesis failure.

### Constraints

- SwiftUI
- Native Apple frameworks only
- Read-only document access
- No account, backend, analytics, subscription, or network dependency

### Acceptance criteria

- App launches into the system document browser.
- User can browse folders and open supported files.
- Opening a document immediately presents the reader.
- Playback, pause, resume, and stop work.
- All five speed presets are distinct.
- Closing the document returns to the same browser folder.

## v0.0.2

Add folder-oriented playback:

- Retain access to a selected folder.
- List supported files from that folder.
- Previous and Next navigation.
- Optional automatic playback of the next file.
- Preserve playback position per document.
