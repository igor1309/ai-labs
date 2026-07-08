---
date: 2026-07-08
model: claude-opus-4-8
description: "Backlog for the FolioTell reader's bottom controls — fix the truncated settings label/menu, then restyle with Liquid Glass."
version: 0.0.1
---

# Backlog — FolioTell reader bottom controls

Two related items for the reader's bottom-controls bar (`ReaderView`
`bottomControls` / `settingsMenu`). Do the label/menu fix first; the Liquid
Glass restyle lands on top of the settled layout.

## Fix the truncated settings menu label

The settings control's summary label crams three settings into one line —
`settingsSummary` = `speed · front-matter · voice` (e.g. `1.5x · Skip · Auto`).
Next to the playback buttons there is not enough width, so the line clips with
an ellipsis (`1.5x · Skip ·…`), hiding the voice and making the control look
broken.

The fix is label-only — the `Menu` content (Speed / Front matter / Voice
sections) stays exactly as is:

- Drop the `settingsSummary` text from the menu label; the control becomes just
  the `slider.horizontal.3` options icon that is already there. With no text
  there is nothing to truncate, and the compact icon is the natural transition
  toward an Apple Music–style Liquid Glass toolbar.
- Give the icon-only control an accessibility label (the text it replaces was
  also its de facto description).
- Remove the now-unused `settingsSummary` / `selectedVoiceTitle` helpers if
  nothing else references them.

## Render the bottom controls with Liquid Glass

Adopt Liquid Glass for the reader's bottom-controls bar, settings control, and
playback buttons for a first-class iOS 26 look. The minimum deployment target
can be raised to iOS 26 — no back-compat constraint.

- Replace the `.background(.bar)` treatment on the bottom controls with the
  Liquid Glass material (`glassEffect` / `.glass` styling as available).
- Style the playback buttons and the settings label so the control cluster reads
  as one glass surface.
- Raise the deployment target to iOS 26 in `Package.swift` and the Xcode
  project; update the release/build config and any docs that state the minimum
  iOS.
- Sequence after the label/menu fix so the surface being restyled is settled.
