---
date: 2026-10-22
model: claude-opus-5-5
description: "Mic capture — QA"
---

# Mic capture — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `215b8a5bbe413db0fbd943a0c7b8cf98964c8b96` |
| driven by | `swift test` of the adapter through a fake of its Core Audio binding, which delivers buffers stamped with host times, listener callbacks and error statuses |
| where | this Mac, no audio device; the binding itself is proven by [user spec S-1](../QA.md) on a real call |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 The owner's voice

- Drive: permission granted; start capture on a session clock that began at host time H; the binding delivers 5 s of buffers at 48 kHz stamped from H + 1 s.
- Expect: 5 s of audio in order, each buffer's session time its host time minus H, exact to the sample; the samples unchanged.
- Evidence: Missing.

### S-2 No permission

- Drive: the binding reports the microphone permission refused; start capture.
- Expect: start throws the permission fault; the binding is never started; no audio.
- Evidence: Missing.

### S-3 Permission withdrawn

- Drive: capture running; the binding reports the permission withdrawn at host time H + 30 s.
- Expect: a lost event with the permission fault at session time 30 s; no audio after it.
- Evidence: Missing.

### S-4 The input device changes

- Drive: capture running on device A; the binding fires the default-input listener at H + 30 s and then delivers buffers from device B.
- Expect: a device change event at session time 30 s; the binding is restarted on device B; B's buffers reach the client after the event.
- Evidence: Missing.

### S-5 The Mac sleeps

- Drive: capture running; the binding reports sleep at H + 30 s and wake at H + 60 s, then delivers buffers.
- Expect: an interruption by sleep from session time 30 s to 60 s; audio resumes after it.
- Evidence: Missing.

### S-6 Stop

- Drive: capture running; stop; the binding then delivers one more buffer.
- Expect: the binding is stopped before `stop()` returns; the late buffer never reaches the client.
- Evidence: Missing.

### S-7 Capture cannot start

- Drive: permission granted; the binding reports no default input device.
- Expect: start throws a device fault naming the missing input; no audio.
- Evidence: Missing.

### S-8 Capture fails mid-call

- Drive: capture running; the binding fires the audio-service-restarted listener at H + 30 s.
- Expect: a lost event with a device fault at session time 30 s; no audio after it.
- Evidence: Missing.

### S-9 The voice is not processed

- Drive: start capture; the binding delivers a fixture buffer.
- Expect: the binding was asked to start with voice processing off; the client's samples equal the fixture's bit for bit.
- Evidence: Missing.
