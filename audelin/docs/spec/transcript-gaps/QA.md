---
date: 2026-10-22
model: claude-opus-5-5
description: "Transcript gaps — QA"
---

# Transcript gaps — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `98088bb0063c3866f0e3a470a6dff9ae20d26ec1` |
| driven by | the user, reading the panel during a Zoom call with a second device |
| where | the release build on this Mac (the debug build where a row says so), the owner and the other device reading timed scripts |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 The Mac sleeps mid-call

- Drive: the other device reads a long sentence; `pmset sleepnow` right after a marked word in its middle; wake after 30 s.
- Expect: the marked word shows before a line «— нет звука звонка с <time> —» in «они», the time matching the sleep; the sentence's halves are not joined.
- Evidence: Missing.

### S-2 The microphone switches device

- Drive: the debug build; the owner says a marked word mid-sentence and chooses [switch-microphone](../debug-menu/SPEC.md) at once; keep talking.
- Expect: the marked word shows before a gap line in «я»; no sentence spans it.
- Evidence: Missing.

### S-3 A permission is withdrawn

- Drive: both sides talking, each saying a marked word just before; withdraw the microphone permission; in a second run, revoke system audio recording for Audelin.
- Expect: each run shows its marked word, then a gap line in the lost side stamped with its time; no sentence spans it.
- Evidence: Missing.

### S-4 Call audio capture fails

- Drive: the other device says a marked word mid-sentence; at once run `sudo killall coreaudiod`, which drops the call-audio capture while macOS restarts its audio daemon; the other device keeps talking.
- Expect: the marked word shows before a gap line in «они» stamped with its time (a «я» gap at the same time is expected too); no sentence spans it.
- Evidence: Missing.
