---
date: 2026-10-22
model: claude-opus-5-5
description: "Call changes — QA"
---

# Call changes — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `70b79b3522c7feeaf0022054bd0950e0961e2e28` |
| driven by | tests of the call changes through a fake call store, a fake trash, a fake recording session and a fake activity gate |
| where | `swift test` on this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 Renaming a call

- Drive: rename «2026.10.21-1430 Zoom» to «Планёрка».
- Expect: the folder is «2026.10.21-1430 Планёрка»; the call id is unchanged.
- Evidence: Missing.

### S-2 Renaming a call while it records

- Drive: the fake session writes into a call; rename it mid-recording; keep writing.
- Expect: the folder is renamed; later audio lands in the renamed folder; the session never fails.
- Evidence: Missing.

### S-3 A title taken in the same minute

- Drive: two calls at 14:30; rename the second to the first one's title.
- Expect: the second's folder ends in « 2».
- Evidence: Missing.

### S-4 An empty title

- Drive: rename to an empty title, then to spaces only.
- Expect: both are refused; the folder keeps its name.
- Evidence: Missing.

### S-5 Deleting a call

- Drive: delete a stopped call.
- Expect: the fake trash holds the whole folder; the store no longer lists it; the client gets the folder's path in the Trash.
- Evidence: Missing.

### S-6 Deleting a call in catch-up

- Drive: the fake gate is held by catch-up for that call; delete it.
- Expect: catch-up is asked to yield; the delete takes the gate and trashes the folder; the catalogue the client sees no longer lists the call.
- Evidence: Missing.

### S-7 Deleting a recording call

- Drive: the fake session records into a call; delete it.
- Expect: refused; nothing is trashed.
- Evidence: Missing.

### S-8 Deleting during a folder move

- Drive: the fake gate is held by a move; delete a call.
- Expect: refused with the move as its reason; nothing is trashed.
- Evidence: Missing.
