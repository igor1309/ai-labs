---
date: 2026-10-22
model: claude-opus-5-5
description: "Quit — QA"
---

# Quit — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `6373eb9a348107b3f5c2d3d885f1908f180b06d0` |
| driven by | the user, through the menu |
| where | the release build on this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 Quitting with nothing running

- Drive: nothing running; choose «Выйти».
- Expect: no confirmation; the menu bar item and the app's windows are gone.
- Evidence: the owner's quit on 2026-10-22, run report `runs/2026-10-22-1019.md`.

### S-2 Quitting during a recording asks first

- Drive: during a recording, choose «Выйти».
- Expect: a confirmation offers to quit or cancel.
- Evidence: Missing.

### S-3 Cancelling the quit keeps recording

- Drive: from S-2, cancel.
- Expect: the recording's time keeps advancing; its audio has no gap.
- Evidence: Missing.

### S-4 Quitting during a recording keeps the call

- Drive: from S-2, confirm; open Audelin.
- Expect: the call is listed and plays up to the quit.
- Evidence: Missing.

### S-5 Quitting during a folder move asks first

- Drive: start moving a calls folder of 50 calls; choose «Выйти».
- Expect: a confirmation offers to quit or cancel.
- Evidence: Missing.

### S-8 Cancelling the quit keeps moving

- Drive: from S-5, cancel.
- Expect: the move's progress keeps advancing and it completes.
- Evidence: Missing.

### S-6 Quitting during a folder move keeps every call

- Drive: from S-5, with at least 10 calls still to move, confirm; open Audelin.
- Expect: all 50 calls are listed and play; Settings shows the old folder with a note that some calls are in the new one.
- Evidence: Missing.

### S-9 Quitting while the last call moves

- Drive: move a calls folder of 2 calls, the second large; choose «Выйти» while it moves; confirm; open Audelin.
- Expect: Settings shows the new folder with no note; both calls are listed.
- Evidence: Missing.

### S-7 Quitting while a call's text catches up

- Drive: stop a call recorded while the model downloaded, as soon as catch-up starts; choose «Выйти».
- Expect: no confirmation; the app is gone.
- Evidence: Missing.

