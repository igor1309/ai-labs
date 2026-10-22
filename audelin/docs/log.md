# Log

## 2026-10-21

- v1 records calls on its own: recording starts when a call starts and
  stops when it ends; live text can be switched off, so Audelin replaces
  Amanu.
- ADR-001: v1 is one modular app; it records first, runs one live stream per
  track, and logs only through decorators in the composition root.
- Name: Audelin, in Russian Одели́н; CLI `audelin`, data in `~/.audelin`.
- Design: Glass Ledger visual language and Screens 1–8, light and dark.
- Versions planned: v1 live transcript, v2 term explanation through bb, v3
  final pass and summary.
- Spike: Parakeet v3 through FluidAudio's sliding window works live with 4 s
  chunks; English terms came out in Cyrillic or wrong, which is still to be
  tested on clean speech. Two live streams at once (mic and call audio) cost
  almost nothing.
- Tried existing apps on real Zoom calls: Superwhisper, Amanu, MacParakeet
  and MacWhisper. None combined a smooth, selectable live transcript with
  explaining a selected term, so we decided to build our own native macOS
  app instead of forking one.
