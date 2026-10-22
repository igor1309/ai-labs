---
date: 2026-10-22
model: claude-opus-5-5
description: "Settings window — QA"
---

# Settings window — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `3c3eb940b5e42e97a3000fecd7b4e34c877a647b` |
| driven by | the user, through «Настройки…» |
| where | the release build and a debug build on this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 What Settings shows

- Drive: after setup, wait until the live model is ready; open Settings.
- Expect: the calls folder's path, the live model as ready, and both switches.
- Evidence: Missing.

### S-2 No chunk size in a release build

- Drive: open the release build's Settings.
- Expect: no chunk size row.
- Evidence: Missing.

### S-3 Chunk size in a debug build

- Drive: open the debug build's Settings; set chunk size to 6 s.
- Expect: the row shows 4 s by default and accepts 6 s.
- Evidence: Missing.

### S-4 A chunk size change waits for the next recording

- Drive: debug build; mid-call set 6 s; then record a new call.
- Expect: the running call keeps 4 s windows; the next call uses 6 s (the debug log's window lengths).
- Evidence: Missing.

### S-5 The live model downloading

- Drive: delete the live model; open the app; start the offered download; open Settings while it runs.
- Expect: the model row shows the download's progress advancing.
- Evidence: Missing.
