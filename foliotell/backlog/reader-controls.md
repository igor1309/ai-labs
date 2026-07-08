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
broken. The underlying `Menu` content is also unbounded because the Voice
section lists every filtered voice.

The fix is a product decision as much as a layout one: only **speed** changes
while listening; **voice** and **front matter** are set-once. So the label
should surface the live setting and the set-once settings should not bloat this
control.

- Shrink the label to the live-relevant setting — speed only (`1.5x`), keeping
  the `slider.horizontal.3` icon. Drop voice (and likely front matter) from the
  label string.
- Move **Voice** selection out of the inline `Menu` into its own presentation
  (a scrollable, searchable sheet/picker) so a long voice list can never be
  clipped by the `.safeAreaInset(edge: .bottom)` controls bar. This also pairs
  with the existing "show detected language" / "show all voices" backlog items.
- Keep the popover `Menu` to the short, bounded settings (Speed, Front matter,
  Start Over) so the truncation is gone by construction, not by fighting the
  popover.
- Add a regression check that the label is not truncated and the full voice
  list is reachable.

Open question: whether front matter also leaves the label/popover, or stays as a
short bounded choice.

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
