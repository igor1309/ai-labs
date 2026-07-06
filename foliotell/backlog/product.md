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

## Persist playback position and resume

Remember the current spoken position per document and resume from that position
after closing, reopening, stopping, or relaunching the app.

- Track progress at a stable text boundary, such as paragraph or sentence range.
- Show a compact progress affordance in the reader.
- Preserve per-document playback position independently from global settings.
- Verify that changing speed or voice does not reset playback to the beginning.

## Verify background and lock-screen playback

Confirm the listening experience on a real device when the app is backgrounded
or the device is locked.

- Verify whether synthesized speech continues under lock and background states.
- Add audio session configuration if required by real-device behavior.
- Add lock-screen or remote transport support only after the basic background
  behavior is validated.

## Normalize text for speech

Build a speech text pipeline that reads document content rather than raw markup.

- Strip skipped leading YAML front matter from speech input.
- Strip Markdown formatting markers, headings, link syntax, and other structural
  punctuation that should not be spoken literally.
- Keep the visual document rendering separate from the normalized speech string.
- Cover the supplied Pushkin Markdown sample and mixed Markdown/plain-text cases.

## Validate language and voice behavior on device

Make voice selection predictable for non-English documents, especially Russian
Markdown documents.

- Test the detected-language voice selection on real iOS hardware.
- Show the detected document language in the voice or controls menu.
- Keep the normal voice list filtered by the detected language.
- Add a manual language override or "show all voices" escape hatch if detection
  is wrong or the desired system voice is hidden.

## Add compact progress navigation controls

Add listening navigation only where it fits the bottom control surface.

- Support previous/next sentence or paragraph navigation.
- Keep the primary play/pause, stop, speed, front-matter, and voice controls in
  the bottom safe-area inset.
- Avoid adding a second toolbar or controls above the document body.

## Add a lightweight recent-documents library

Remember recently opened documents and their per-document listening state.

- Store recent document identity, display title, playback position, speed, voice,
  and front-matter mode.
- Reopen recent documents without forcing the user back through the Files picker
  when security-scoped access is still available.
- Keep this local and offline; no account, sync, analytics, or backend.

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
