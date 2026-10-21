---
date: 2026-10-22
model: claude-opus-5-5
description: "Calls folder change — QA"
---

# Calls folder change — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `360298a3e9649b7eccd31daed1b5f5568f5e0b92` |
| driven by | the user, through Settings and the panel |
| where | the release build on this Mac (the debug build for S-9, S-10), a calls folder seeded with 50 recorded test calls |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 A move asks first

- Drive: choose a new folder in Settings.
- Expect: a confirmation like «Перенести 50 звонков (135 МБ)?».
- Evidence: Missing.

### S-2 Cancelling a move

- Drive: from S-1, cancel.
- Expect: Settings shows the old folder; every call is still there.
- Evidence: Missing.

### S-3 A move completes

- Drive: from S-1, confirm; wait.
- Expect: Settings shows the new folder; the calls list shows all 50, each playable; the old folder holds no calls.
- Evidence: Missing.

### S-4 A move in progress

- Drive: during S-3, look at Settings.
- Expect: a progress count advances call by call.
- Evidence: Missing.

### S-5 A move that fails

- Drive: target a small disk image that fills mid-move.
- Expect: «Перенесено 31 из 50. 'Zoom 2': диск заполнен.»-style report; Settings shows the old folder with a note naming the new one; the 19 calls not moved are in the old folder, each folder whole.
- Evidence: Missing.

### S-6 Retrying a failed move

- Drive: after S-5, free space; press Retry.
- Expect: the move completes; Settings shows the new folder; the calls list holds all 50 seeded calls.
- Evidence: Missing.

### S-7 No move during a recording

- Drive: during a recording, choose a new folder.
- Expect: Settings says «идёт запись — папку можно сменить после звонка»; nothing moves.
- Evidence: Missing.

### S-8 No recording during a move

- Drive: start a move of the 50 calls; join a Zoom call with auto-record ticked.
- Expect: the panel says the call is not recorded because calls are being moved; no new call folder.
- Evidence: Missing.

### S-9 A recording wins a simultaneous request

- Drive: debug build; choose the race trigger until the debug log records the recording request reaching the activity gate first.
- Expect: the recording runs; the move is reported refused because a call records.
- Evidence: Missing.

### S-10 A move wins a simultaneous request

- Drive: debug build; choose the race trigger until the debug log records the move request reaching the activity gate first.
- Expect: the move runs; the recording is reported refused because calls are moving.
- Evidence: Missing.
