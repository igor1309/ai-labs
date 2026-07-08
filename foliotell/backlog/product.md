---
date: 2026-07-06
model: gpt-5
description: "Forward product backlog for FolioTell after the first simulator implementation."
version: 0.0.1
---

# Backlog — FolioTell product

Keep the near-term backlog focused on making FolioTell trustworthy as a
document-listening app before expanding formats, accounts, network features, or
AI features.

## Verify background and lock-screen playback

Confirm the listening experience on a real device when the app is backgrounded
or the device is locked.

- Verify whether synthesized speech continues under lock and background states.
- Add audio session configuration if required by real-device behavior.
- Add lock-screen or remote transport support only after the basic background
  behavior is validated.

## Validate language and voice behavior on device

Make voice selection predictable for non-English documents, especially Russian
Markdown documents.

- Test the detected-language voice selection on real iOS hardware.
- Show the detected document language in the voice or controls menu.
- Keep the normal voice list filtered by the detected language.
- Add a manual language override or "show all voices" escape hatch if detection
  is wrong or the desired system voice is hidden.

## Persist per-document listening settings

Keep each document's listening setup independent, so switching between
documents (for example a Russian poem at 0.9× and an English article at 1.5×)
does not drag one document's speed, voice, or front-matter mode onto another.
Recents listing and reopening are already covered by the system document
browser's Recents tab; no custom library UI unless a "continue listening"
affordance proves necessary.

- Store speed, voice, and front-matter mode per document alongside the
  playback position, extending the ADR-001 position store (designed as this
  extension point).
- Fall back to the global defaults for documents without a record.
- Keep this local and offline; no account, sync, analytics, or backend.
- Optional follow-up, only if renames/moves happen in practice: key records by
  security-scoped bookmark instead of path so listening state survives
  rename/move.

## Maintain reusable Maestro regression flows

Keep simulator coverage for the interaction bugs that have already appeared.

- Open the supplied Pushkin Markdown file.
- Verify play, pause/resume, stop, and speed change without restarting from the
  beginning.
- Verify front-matter skip/read behavior.
- Verify the voice menu is filtered for the detected document language.

## Render Markdown more clearly

Improve the reader's visual presentation without changing the document model.

- Render headings, paragraphs, lists, and front matter with distinct SwiftUI
  styles.
- Keep front matter secondary and caption-sized when it is visible.
- Consider hiding visible front matter when the front-matter setting is Skip if
  user testing shows that "skip" is understood as both visual and spoken hiding.
