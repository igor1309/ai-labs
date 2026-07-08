---
date: 2026-07-08
model: claude-opus-4-8
description: "Backlog for the FolioTell reader's bottom controls — restyle with Liquid Glass at an iOS 26 target."
version: 0.0.1
---

# Backlog — FolioTell reader bottom controls

## Render the bottom controls with Liquid Glass

Adopt Liquid Glass for the reader's bottom-controls bar, settings control, and
playback buttons for a first-class iOS 26 look. The minimum deployment target
can be raised to iOS 26 — no back-compat constraint.

- Replace the `.background(.bar)` treatment on the bottom controls with the
  Liquid Glass material (`glassEffect` / `.glass` styling as available).
- Style the playback buttons and the settings control so the cluster reads as
  one glass surface.
- Raise the deployment target to iOS 26 in `Package.swift` and the Xcode
  project; update the release/build config and any docs that state the minimum
  iOS.
