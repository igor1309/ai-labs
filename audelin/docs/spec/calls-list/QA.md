---
date: 2026-10-22
model: claude-opus-5-5
description: "Calls list — QA"
---

# Calls list — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `d94ffc7f8b0bbe97236a0d1489f1d80ed3d97620` |
| driven by | the user, through the calls list and Finder |
| where | the release build on this Mac (the debug build where a row says so), a calls folder seeded with copies of recorded test calls |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 Calls newest first

- Drive: seed calls dated 12, 17, 20 and 21 October; open «Звонки…».
- Expect: rows read 21, 20, 17, 12 October, each with its title and duration.
- Evidence: Missing.

### S-2 A recording call

- Drive: start a recording; open the calls list.
- Expect: its row is marked as recording.
- Evidence: Missing.

### S-3 A call still catching up

- Drive: record a call while the model downloads; stop it as the model arrives; open the list.
- Expect: its row is marked as catching up until the text completes, then unmarked.
- Evidence: Missing.

### S-4 A stopped call is listed while its text lags

- Drive: the debug build; hold the recogniser mid-call; press Стоп; keep holding.
- Expect: the call's row is there, marked as catching up, while the recogniser is still held.
- Evidence: Missing.

### S-5 Opening a call

- Drive: open a stopped call.
- Expect: its call screen shows its title and text.
- Evidence: Missing.

### S-6 An unreadable call

- Drive: corrupt a seeded call's details file; open the list.
- Expect: the call is listed as unreadable with only «Показать в Finder», which opens its folder.
- Evidence: Missing.

### S-7 A call folder removed in Finder

- Drive: move a call folder to the Trash in Finder; look at the open list.
- Expect: the call's row disappears.
- Evidence: Missing.

### S-8 A call with one side missing

- Drive: revoke the system audio recording permission; record a call; open the list.
- Expect: the row says only «я» was recorded.
- Evidence: Missing.

### S-9 A call cut short by a crash

- Drive: mid-call, `kill -9` the app; open it and the calls list.
- Expect: the call is listed with its duration up to the kill.
- Evidence: Missing.

### S-10 A call with the microphone missing

- Drive: revoke microphone access for Audelin; record a Zoom call; open the list.
- Expect: the row says only «они» was recorded.
- Evidence: Missing.
