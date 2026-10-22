---
date: 2026-10-22
model: claude-opus-5-5
description: "Settings store — QA"
---

# Settings store — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `a208007b08cd2872433e66327fc21b32c3731e45` |
| driven by | integration tests of the adapter over a temporary home folder |
| where | this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 A setting is kept

- Drive: save the calls folder path; open a new adapter.
- Expect: the same path; the file is under `<home>/.audelin`.
- Evidence: Missing.

### S-2 Nothing saved yet

- Drive: read the calls folder path from an empty home.
- Expect: unset.
- Evidence: Missing.

### S-3 A damaged settings file

- Drive: write invalid JSON as the settings file; read.
- Expect: every setting unset; the invalid file is kept beside it under a new name.
- Evidence: Missing.

### S-4 A setting is replaced

- Drive: save live text on, then off; open a new adapter.
- Expect: live text reads off.
- Evidence: Missing.

### S-5 Other settings stay

- Drive: save calls folder A and setup finished; save calls folder B; open a new adapter.
- Expect: the calls folder reads B; setup reads finished.
- Evidence: Missing.
