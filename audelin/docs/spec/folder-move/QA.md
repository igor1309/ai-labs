---
date: 2026-10-22
model: claude-opus-5-5
description: "Folder move — QA"
---

# Folder move — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `4f5307288ba8d6409e193795ab49aefe81c23cd1` |
| driven by | tests of the move through a fake call store over two temporary folders, a fake settings store and a fake activity gate |
| where | `swift test` on this Mac, with real files in temporary folders |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 What a move will take

- Drive: 50 seeded calls of known sizes; choose a new folder.
- Expect: the plan says 50 calls and their summed size.
- Evidence: Missing.

### S-2 A move completes

- Drive: move the 50 calls.
- Expect: the new folder holds 50 call folders byte-identical to the sources; the old one holds none; the settings store has the new path.
- Evidence: Missing.

### S-3 Progress

- Drive: move 50 calls, recording each progress event.
- Expect: events count 1 to 50 in order, one per call.
- Evidence: Missing.

### S-4 A call cannot be moved

- Drive: the fake store fails the copy of the 32nd call with disk full.
- Expect: the result says 31 of 50 moved, which call failed and «disk full»; the settings store keeps the old path; the 19 not moved are whole in the old folder.
- Evidence: Missing.

### S-5 Retrying a failed move

- Drive: from S-4, clear the failure; retry.
- Expect: the remaining 19 move; the new folder holds all 50; the settings store has the new path.
- Evidence: Missing.

### S-6 A crash mid-move

- Drive: stop the move mid-copy of the 10th call, leaving a partial copy; start a new folder-move core on the same fake ports, as a launch does.
- Expect: the partial copy is gone; 9 calls are whole in the new folder and the other 41 whole in the old one; each of the 50 ids is found exactly once.
- Evidence: Missing.

### S-7 No move during a recording

- Drive: the fake gate is held by a recording; move.
- Expect: refused with the recording as its reason; nothing is copied.
- Evidence: Missing.

### S-8 A new folder inside the calls folder

- Drive: choose `<calls>/sub` as the new folder.
- Expect: refused with that reason; nothing is copied.
- Evidence: Missing.
