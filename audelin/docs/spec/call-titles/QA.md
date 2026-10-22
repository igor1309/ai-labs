---
date: 2026-10-22
model: claude-opus-5-5
description: "Call titles — QA"
---

# Call titles — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `7341bc5eecd6f6431f9014214f43bd5f63d44b4b` |
| driven by | the user, through the calls list and Finder |
| where | the release build on this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 A call is titled after its call app

- Drive: auto-record ticked, nothing recording; join a Zoom call; open the calls list.
- Expect: the call reads «Zoom»; its folder is «<yyyy.MM.dd-HHmm> Zoom».
- Evidence: Missing.

### S-2 A browser call is titled after the browser

- Drive: auto-record ticked, nothing recording; join a Meet call in Chrome.
- Expect: the call reads «Chrome».
- Evidence: Missing.

### S-3 A recording by hand with no call app

- Drive: no call app open; «Начать запись».
- Expect: the call and its folder are titled «Звонок».
- Evidence: Missing.

### S-4 Two call apps on the microphone

- Drive: auto-record unticked, nothing recording; join a Zoom call, then a Telemost call; «Начать запись».
- Expect: the call reads «Zoom».
- Evidence: Missing.

### S-5 A recording by hand during a call

- Drive: auto-record unticked, nothing recording; join a Zoom call; «Начать запись».
- Expect: the call reads «Zoom».
- Evidence: Missing.

### S-13 Two calls with one title in the same minute

- Drive: auto-record unticked; join a Zoom call; at the start of a minute «Начать запись», «Остановить запись», «Начать запись».
- Expect: the second reads «Zoom 2»; its folder «<same timestamp> Zoom 2».
- Evidence: Missing.
