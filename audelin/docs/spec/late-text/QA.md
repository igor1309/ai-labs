---
date: 2026-10-22
model: claude-opus-5-5
description: "Late text — QA"
---

# Late text — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `6671005be8160fe5714640839b9a6d8a5d77e810` |
| driven by | tests through a fake recogniser replaying Parakeet v3 output recorded once, a fake recorded-audio reader, segment log, activity gate and clock |
| where | `swift test` on this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 The model arrives late

- Drive: live text on; a recording with 120 s of audio and the fake model provider not ready; make it ready.
- Expect: the first 120 s are committed in time order, each marked added later; live text goes on from 120 s.
- Evidence: Missing.

### S-2 Live text switched on mid-call

- Drive: live text off for the first 90 s with the model ready; switch it on.
- Expect: the first 90 s are committed marked added later; live text goes on from 90 s.
- Evidence: Missing.

### S-3 Live text off throughout

- Drive: a stopped call recorded with live text off throughout; free the gate.
- Expect: nothing is sent to the recogniser; the client gets the call marked only recorded.
- Evidence: Missing.

### S-4 Live text switched off partway

- Drive: live text on for 0–90 s, off from 90 s to the stop at 300 s; free the gate.
- Expect: 0–90 s has text; 90–300 s is marked only recorded and never sent to the recogniser.
- Evidence: Missing.

### S-5 Text the live pass missed

- Drive: a stopped call with live text on throughout, whose live pass reached 200 s of 300 s; free the gate.
- Expect: 200–300 s is committed by catch-up; nothing is marked only recorded.
- Evidence: Missing.

### S-6 Marks survive a relaunch

- Drive: from S-1, drop the core and open a new one on the same fake store.
- Expect: the first 120 s still come marked added later.
- Evidence: Missing.
