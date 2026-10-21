---
date: 2026-10-22
model: claude-opus-5-5
description: "Audelin v1 — QA of the user journeys: the built app on this Mac, real calls and injected faults"
---

# Audelin v1 — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `ad3c28387ca32a40077e9eb95fdfe8be78926134` |
| driven by | the user: the owner, or an agent through the app's windows and the call folders |
| where | the release build on this Mac (the debug build for S-18); Zoom calls between this Mac and a second device, the owner speaking Russian with English terms |

## Scenarios

One row per [SPEC.md](SPEC.md) scenario. Verdicts live in run reports under
`runs/`, never here. A row has evidence or reads Missing.

### S-1 A call records itself and reads live

- Drive: both switches ticked, model ready; join a Zoom call and read a script from both devices.
- Expect: the menu bar shows «Запись · Zoom»; the panel shows the owner's lines under «я» and the other device's under «они» before the call ends.
- Evidence: Missing.

### S-2 A call that ends is kept

- Drive: end the call from S-1 and wait past the call-end time.
- Expect: the calls list has the call; it plays both tracks and reads the script; the panel still shows its text.
- Evidence: Missing.

### S-7 English terms in Russian speech read as spoken

- Drive: the owner reads Russian sentences containing RACI, OKR and SLA.
- Expect: the panel and the call's text show RACI, OKR and SLA in Latin letters.
- Evidence: Missing.

### S-16 Each call has its own folder

- Drive: after S-2, choose «Открыть папку звонков» in the menu.
- Expect: Finder shows one folder for the call, named by its start time and «Zoom».
- Evidence: Missing.

### S-18 A stalled recogniser does not stop recording

- Drive: the debug build; mid-call, hold the recogniser from the menu for a minute while reading a script, then release it.
- Expect: both tracks play through the held minute; its text appears later and matches the script, no word twice or missing.
- Evidence: Missing.

### S-19 A crash keeps the call

- Drive: both switches ticked, model ready; mid-call, `kill -9` the app while reading a script; open it again.
- Expect: the call is listed with audio up to the kill; its text completes and matches the script up to the kill, no word twice or missing.
- Evidence: Missing.

### S-26 A fresh install reaches a working live panel

- Drive: a macOS user account that has never run Audelin; install, complete setup, record a short call.
- Expect: the call's words appear live in the panel.
- Evidence: Missing.
