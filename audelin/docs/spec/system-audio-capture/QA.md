---
date: 2026-10-22
model: claude-opus-5-5
description: "System audio capture — QA"
---

# System audio capture — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `a54e083f9d6fac6f82306a91349405fb07be212a` |
| driven by | integration tests of the adapter on this Mac, with a USB headset |
| where | this Mac, a test-host app holding the system audio permission |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 The call's sound

- Drive: start mic and system audio capture on one session clock; `afplay` a 440 Hz tone with a click that also plays into the loopback input; capture 5 s.
- Expect: about 5 s peaking at 440 Hz with increasing session times; the click lands within 20 ms of its time in the microphone audio.
- Evidence: Missing.

### S-2 No permission

- Drive: reset the test host's system audio permission; deny; start capture.
- Expect: a refusal with the permission reason; no sound.
- Evidence: Missing.

### S-3 Permission withdrawn

- Drive: capture running; withdraw the permission in System Settings.
- Expect: a lost fault with the permission kind, stamped within 1 s of the change.
- Evidence: Missing.

### S-4 Capture fails

- Drive: capture running; `sudo killall coreaudiod`.
- Expect: a lost fault with the audio service kind, stamped within 1 s.
- Evidence: Missing.

### S-5 The Mac sleeps

- Drive: capture running with `afplay`; `pmset sleepnow`; wake after 30 s.
- Expect: an interruption with the sleep kind, spanning the sleep; sound resumes after the wake.
- Evidence: Missing.

### S-6 The output device changes

- Drive: `afplay` a tone; switch output from the speakers to the USB headset.
- Expect: an interruption whose start and end bracket the switch; the tone is captured again after it.
- Evidence: Missing.

### S-7 Stop

- Drive: stop while the tone plays.
- Expect: no sound callback after `stop()` returns.
- Evidence: Missing.

### S-8 Capture cannot start

- Drive: `sudo killall -STOP coreaudiod`, start capture, then `sudo killall -CONT coreaudiod`.
- Expect: a start failure naming the audio service within the start timeout; no sound.
- Evidence: Missing.

### S-9 The sound is not processed

- Drive: a 60 s fixture of speech at levels from −40 to −6 dBFS with quiet noise passages at −60 dBFS, played with `afplay` at full system volume.
- Expect: aligned to the fixture, each 100 ms block's level is within 0.5 dB of the source's, the noise passages included, and the waveform correlates above 0.99.
- Evidence: Missing.
