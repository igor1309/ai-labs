---
date: 2026-07-08
model: gpt-5
description: "Forward product backlog for FolioTell after the first simulator implementation."
version: 0.0.2
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

## Fix the settings menu's truncated bottom inset

The reader's settings menu (`readerSettingsMenu`) opens from the bottom-controls
bar, which lives in a `.safeAreaInset(edge: .bottom)`. With the Voice section
listing every filtered voice the menu grows long, and it renders with a bad
bottom inset that truncates the last entries — the tail of the list is cut off
and hard or impossible to reach.

- Reproduce with a document that yields many filtered voices (long voice list).
- Make the full menu reliably reachable regardless of length: let it scroll to
  the true bottom, or present the long/voice portion so it clears the
  bottom-inset controls bar rather than being clipped by it.
- Consider splitting Voice selection out of the inline `Menu` into its own
  presentation (sheet or dedicated picker) if the popover cannot host the full
  list cleanly — this also pairs with the "show detected language" and
  "show all voices" items above.
- Add a Maestro/regression check that the last voice entry is reachable.

## Render the bottom controls with Liquid Glass

Adopt Liquid Glass for the reader's bottom-controls bar and settings menu for a
first-class iOS 26 look. The minimum deployment target can be raised to iOS 26
for this — no back-compat constraint.

- Replace the `.background(.bar)` treatment on the bottom controls with the
  Liquid Glass material (`glassEffect` / `.glass` button styling as available).
- Apply glass styling to the playback buttons and the settings menu label so the
  control cluster reads as one glass surface.
- Raise the deployment target to iOS 26 in `Package.swift` and the Xcode project;
  update the release/build config and any docs that state the minimum iOS.
- Sequence this after the truncated-menu fix so the menu presentation is settled
  before restyling it.

## Render Markdown more clearly

Improve the reader's visual presentation without changing the document model.

- Render headings, paragraphs, lists, and front matter with distinct SwiftUI
  styles.
- Keep front matter secondary and caption-sized when it is visible.
- Consider hiding visible front matter when the front-matter setting is Skip if
  user testing shows that "skip" is understood as both visual and spoken hiding.
