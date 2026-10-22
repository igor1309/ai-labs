---
date: 2026-10-22
model: claude-opus-5-5
description: "Setup — QA"
---

# Setup — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `69555140fa9d70d1c2aae90bf6daf7675a4f7b4f` |
| driven by | tests of setup through a fake settings store, a fake file system over temporary folders and a fake model store |
| where | `swift test` on this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 First launch

- Drive: an empty fake settings store; ask whether setup is needed.
- Expect: yes, proposing `~/Recordings/Audelin`.
- Evidence: Missing.

### S-2 A chosen calls folder

- Drive: finish setup with a temporary folder that does not exist yet.
- Expect: the settings store holds that path; the folder exists.
- Evidence: Missing.

### S-3 Setup is done once

- Drive: from S-2, open a new core on the same store.
- Expect: setup is not needed.
- Evidence: Missing.

### S-4 Everything in place

- Drive: from S-2 with the model present; run the launch check.
- Expect: no problems.
- Evidence: Missing.

### S-5 The calls folder is gone

- Drive: from S-2, remove the folder; run the check; recreate. Then remove it again, run the check, and set another folder.
- Expect: missing folder reported; recreate makes it at the old path; setting another stores the new path.
- Evidence: Missing.

### S-6 The calls folder cannot be written

- Drive: make the folder read-only; run the check.
- Expect: reported as not writable, reason read-only.
- Evidence: Missing.

### S-7 The live model is gone

- Drive: the fake model store reports the model missing; run the check.
- Expect: the live model reported missing.
- Evidence: Missing.

### S-8 Two problems at once

- Drive: remove the folder and the model; run the check.
- Expect: both reported in one result.
- Evidence: Missing.

### S-9 Accepting the default calls folder

- Drive: a temporary home where the proposed default folder does not exist; finish setup with the proposal.
- Expect: the settings store holds the proposed folder; the folder now exists.
- Evidence: Missing.
