---
date: 2026-10-22
model: claude-opus-5-5
description: "Recording faults — QA"
---

# Recording faults — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `7cf9514535b817a6f05879f5671b239055cd5631` |
| driven by | tests of the session through fake capture, recorder, store and clock ports |
| where | `swift test` on this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 Starting with no call audio

- Drive: the fake system-audio port refuses with a permission error; start.
- Expect: observers get a running state with «они» lost, reason permission; the microphone track is written.
- Evidence: Missing.

### S-2 Starting with no microphone

- Drive: the fake microphone port refuses with a permission error; start.
- Expect: observers get a running state with «я» lost, reason permission; the call-audio track is written.
- Evidence: Missing.

### S-3 Call audio lost mid-call

- Drive: feed both tracks; at 30 s of fake time the system-audio port reports its tap lost; feed 60 s more of the microphone.
- Expect: observers get «они» lost since 30 s; the microphone track holds all 90 s.
- Evidence: Missing.

### S-4 Microphone lost mid-call

- Drive: as S-3 with the microphone port failing at 30 s.
- Expect: observers get «я» lost since 30 s; the call-audio track holds all 90 s.
- Evidence: Missing.

### S-5 The microphone switches device

- Drive: the fake microphone port reports a device change at 30 s and goes on feeding.
- Expect: no fault is reported; the microphone track keeps growing with a new epoch from 30 s; the call-audio track keeps growing unbroken.
- Evidence: Missing.

### S-6 The disk fills

- Drive: a fake store that reports disk full at 45 s, with 30 s files.
- Expect: observers get a failed state stamped 45 s; capture ports are stopped; the reader returns the first 30 s per track.
- Evidence: Missing.

### S-7 The calls folder vanishes

- Drive: a fake store that reports the folder gone at 45 s.
- Expect: observers get a failed state stamped 45 s; capture ports are stopped.
- Evidence: Missing.

### S-8 No start on a full disk

- Drive: the fake store reports no free space; query whether a start is possible.
- Expect: the answer is no, reason disk full.
- Evidence: Missing.

### S-9 Room on the disk again

- Drive: from S-6, the fake store reports free space; query whether a start is possible; start.
- Expect: the answer turns yes; the new recording runs and its audio is readable.
- Evidence: Missing.
