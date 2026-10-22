---
date: 2026-10-22
model: claude-opus-5-5
description: "Mic capture — QA"
---

# Mic capture — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `a27a695b35f9181eabfb8e38cd467409a3b05b7b` |
| driven by | integration tests of the adapter on this Mac, with a USB headset and a loopback audio device |
| where | this Mac, a test-host app holding the microphone permission |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 The owner's voice

- Drive: start mic and system audio capture on one session clock; play a click into the loopback input set as default and through the output at the same moment; capture 5 s.
- Expect: about 5 s of audio with increasing session times; the click lands within 20 ms of its time in the call audio.
- Evidence: Missing.

### S-2 No permission

- Drive: `tccutil reset Microphone` for the test host; deny the prompt; start capture.
- Expect: a refusal with the permission reason; no audio.
- Evidence: Missing.

### S-3 Permission withdrawn

- Drive: capture running; withdraw the permission in System Settings.
- Expect: a lost fault with the permission kind, stamped within 1 s of the change.
- Evidence: Missing.

### S-4 The input device changes

- Drive: capture from the built-in microphone; set the macOS default input to the USB headset, which carries a 1 kHz tone.
- Expect: a device change event stamped within 1 s of the switch; the audio then peaks at 1 kHz.
- Evidence: Missing.

### S-5 The Mac sleeps

- Drive: capture running; `pmset sleepnow`; wake after 30 s.
- Expect: an interruption with the sleep kind, spanning the sleep; audio resumes after the wake.
- Evidence: Missing.

### S-6 Stop

- Drive: stop while the tone plays.
- Expect: no audio callback after `stop()` returns.
- Evidence: Missing.

### S-7 Capture cannot start

- Drive: a virtual machine with no input device; start capture.
- Expect: a start failure naming the missing device; no audio.
- Evidence: Missing.

### S-8 Capture fails mid-call

- Drive: capture running; `sudo killall coreaudiod`.
- Expect: a lost fault with the device kind, stamped within 1 s.
- Evidence: Missing.

### S-9 The voice is not processed

- Drive: a 60 s fixture of speech at levels from −40 to −6 dBFS with quiet noise passages at −60 dBFS, played into the loopback input.
- Expect: aligned to the fixture, each 100 ms block's level is within 0.5 dB of the source's, the noise passages included, and the waveform correlates above 0.99.
- Evidence: Missing.
