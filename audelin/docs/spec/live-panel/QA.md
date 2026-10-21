---
date: 2026-10-22
model: claude-opus-5-5
description: "Live panel — QA"
---

# Live panel — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `faab54c43db3bbfe158da2c8591c12270bdd61c3` |
| driven by | the user, through the panel, with Zoom on a second device |
| where | the release build on this Mac (the debug build where a row says so) |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 The panel floats over a full-screen call

- Drive: Zoom full screen; «Показать панель».
- Expect: the panel is drawn over Zoom in Zoom's space.
- Evidence: Missing.

### S-2 The panel does not take focus

- Drive: type in Zoom's chat while the other device speaks.
- Expect: every keystroke lands in Zoom; the panel never becomes key.
- Evidence: Missing.

### S-3 The panel resizes

- Drive: drag the panel's right edge 200 pt wider.
- Expect: lines rewrap at the new width; nothing is cut off.
- Evidence: Missing.

### S-12 Nothing recording

- Drive: nothing recording; look at the header.
- Expect: the header says nothing is recording and offers Начать; no running time.
- Evidence: Missing.

### S-4 Starting from the panel

- Drive: nothing recording; press Начать.
- Expect: the header shows a running time; a new call folder appears.
- Evidence: Missing.

### S-5 Stopping from the panel

- Drive: during a recording, read the header; press Стоп.
- Expect: the header showed the advancing time; after Стоп nothing records.
- Evidence: Missing.

### S-6 Стоп lands on the call

- Drive: press Стоп during a recording.
- Expect: the calls list comes up with that call selected.
- Evidence: Missing.

### S-13 Стоп while the recogniser is stuck

- Drive: the debug build; hold the recogniser mid-call; press Стоп.
- Expect: the header shows nothing recording within 5 s; the call is listed.
- Evidence: Missing.

### S-14 Стоп before the live model is ready

- Drive: remove the live model; open the app; start a recording; press Стоп while it downloads.
- Expect: the header shows nothing recording within 5 s; the call is listed.
- Evidence: Missing.

### S-7 The last call stays in the panel

- Drive: live text on, model ready; the owner says a first marked phrase and waits until it shows; then says a second and presses Стоп right after.
- Expect: the first phrase showed before Стоп; after Стоп the panel holds both phrases and cannot be edited.
- Evidence: Missing.
