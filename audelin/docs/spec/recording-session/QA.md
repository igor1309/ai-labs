---
date: 2026-10-22
model: claude-opus-5-5
description: "Recording session — QA"
---

# Recording session — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `5e15489c1bc59b0c8119c2117c72d660a3437ecb` |
| driven by | tests of the session through fake capture, recorder, recogniser, store and clock ports |
| where | `swift test` on this Mac; the real crash is the user spec's S-19 |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 Starting a recording

- Drive: subscribe two observers; start a recording titled «Zoom» for the app Zoom through the session's API.
- Expect: both observers get a running state titled «Zoom» with the fake clock's start time.
- Evidence: Missing.

### S-2 Stopping a recording

- Drive: from S-1, feed 20 s of a known tone per track; stop.
- Expect: both observers get a stopped state within 5 s of fake time; the fake reader returns the 20 s fed for both tracks.
- Evidence: Missing.

### S-3 Stopping with the recogniser stuck

- Drive: a fake recogniser that never returns; record, then stop.
- Expect: the stopped state arrives within 5 s of fake time.
- Evidence: Missing.

### S-4 Stopping with no live model

- Drive: a fake model provider still downloading; record, then stop.
- Expect: the stopped state arrives within 5 s of fake time.
- Evidence: Missing.

### S-5 Audio is readable as soon as it is written

- Drive: 30 s files; fake capture feeds 5 s of a known tone per track; read through the fake reader at once.
- Expect: the reader returns those 5 s for both tracks while the first file is still open.
- Evidence: Missing.

### S-6 Recording never waits for recognition

- Drive: a fake recogniser that never returns; feed 600 s per track.
- Expect: all 600 s per track are readable; every one of the fake capture's 6 000 buffers per track returned from the session.
- Evidence: Missing.

### S-7 Starting during a folder move

- Drive: hold the activity gate as a move; start.
- Expect: the start is refused with the move as its reason; nothing is written.
- Evidence: Missing.

### S-8 A second start while recording

- Drive: from S-1, start again.
- Expect: still one session; observers see no change.
- Evidence: Missing.

### S-9 A session ended without Stop

- Drive: feed 75 s per track; drop the session without stop.
- Expect: the call's details were made at the start and all 75 s per track reached the writer, which was never stopped; that at most the open 30 s file is then lost is the recorder's S-4.
- Evidence: Missing.
