---
date: 2026-10-22
model: claude-opus-5-5
description: "Call delete — QA"
---

# Call delete — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `bdc1863b2379c9a6b1983d558fcd9a09b1c82272` |
| driven by | the user, through the calls list and Finder |
| where | the release build on this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 Delete asks first

- Drive: hover a stopped call; press Удалить.
- Expect: a confirmation names the whole call: audio and text.
- Evidence: Missing.

### S-2 Cancelling a delete

- Drive: from S-1, cancel.
- Expect: the call is listed; its folder is unchanged.
- Evidence: Missing.

### S-3 Delete removes the whole call

- Drive: from S-1, confirm.
- Expect: the row is gone; the call's folder, with its audio and text, is in the Trash.
- Evidence: Missing.

### S-4 Deleting a call that is catching up

- Drive: stop a call recorded while the model downloaded, as catch-up starts; Удалить, confirm; wait two minutes.
- Expect: the row is gone and stays gone; no folder for it reappears.
- Evidence: Missing.

### S-5 A recording call cannot be deleted

- Drive: hover the recording call's row.
- Expect: no Удалить.
- Evidence: Missing.
