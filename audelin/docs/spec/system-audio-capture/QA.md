---
date: 2026-10-22
model: claude-opus-5-5
description: "System audio capture — QA"
---

# System audio capture — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `1a783f351e9ef956a9a75d0acf37bebefb678cfe` |
| driven by | `swift test` of the adapter through a fake of its Core Audio binding (process tap and private aggregate device), which delivers buffers stamped with host times, listener callbacks and error statuses |
| where | this Mac, no audio device; the binding itself is proven by [user spec S-1](../QA.md) on a real call |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 The call's sound

- Drive: permission granted; start capture on a session clock that began at host time H; the binding delivers 5 s of buffers at 48 kHz stamped from H + 1 s.
- Expect: 5 s of sound in order, each buffer's session time its host time minus H, exact to the sample; the samples unchanged.
- Evidence: Missing.

### S-2 No permission

- Drive: the binding reports the system audio permission refused, as the build finds Core Audio signals it; start capture.
- Expect: the permission fault, at start or as a lost event at session time 0; no sound.
- Evidence: Missing.

### S-3 Permission withdrawn

- Drive: capture running; the binding reports the permission withdrawn at host time H + 30 s.
- Expect: a lost event with the permission fault at session time 30 s; no sound after it.
- Evidence: Missing.

### S-4 Capture fails

- Drive: capture running; the binding fires the audio-service-restarted listener at H + 30 s.
- Expect: a lost event with a device fault naming the audio service at session time 30 s; no sound after it.
- Evidence: Missing.

### S-5 The Mac sleeps

- Drive: capture running; the binding reports sleep at H + 30 s and wake at H + 60 s, then delivers buffers.
- Expect: an interruption by sleep from session time 30 s to 60 s; sound resumes after it.
- Evidence: Missing.

### S-6 The output device changes

- Drive: capture running; the binding fires the default-output listener at H + 30 s, the tap is rebuilt, and buffers arrive from H + 31 s.
- Expect: an interruption from session time 30 s to 31 s; sound resumes after it.
- Evidence: Missing.

### S-7 Stop

- Drive: capture running; stop; the binding then delivers one more buffer.
- Expect: the tap and aggregate device are torn down before `stop()` returns; the late buffer never reaches the client.
- Evidence: Missing.

### S-8 Capture cannot start

- Drive: permission granted; the binding fails to create the tap with an error status.
- Expect: start throws a device fault carrying the status; nothing is left created; no sound.
- Evidence: Missing.

### S-9 The sound is not processed

- Drive: start capture; the binding delivers a fixture buffer.
- Expect: the client's samples equal the fixture's bit for bit.
- Evidence: Missing.
