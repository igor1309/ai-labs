---
date: 2026-10-22
model: claude-opus-5-5
description: "Call folder names — QA"
---

# Call folder names — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `da21d00a4ea990aa4fe7ebbc38916776ca5e26a5` |
| driven by | unit tests of the naming functions |
| where | `swift test` in `audelin/macos` on this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 A new call's folder name

- Drive: 21 Oct 2026 14:30 local time, title «Zoom».
- Expect: «2026.10.21-1430 Zoom».
- Evidence: the suite at the head.

### S-2 Reading a name back

- Drive: make a name from 21 Oct 2026 14:30:47 «Планёрка» and read it; read «2026.10.21-1430 Q3-Q4 план» and «2026.10.21-1430 Zoom 2»; make and read a name from 14:30 «Этап 2».
- Expect: start 2026-10-21 14:30 with title «Планёрка»; 14:30 with «Q3-Q4 план»; 14:30 with «Zoom 2»; 14:30 with «Этап 2».
- Evidence: the suite at the head.

### S-3 A name without a start time

- Drive: read «Планёрка».
- Expect: title «Планёрка», no start time.
- Evidence: the suite at the head.

### S-4 A title taken in the same minute

- Drive: «2026.10.21-1430 Zoom» exists; ask for 14:30 «Zoom».
- Expect: «2026.10.21-1430 Zoom 2».
- Evidence: the suite at the head.

### S-5 Two titles already taken

- Drive: «… Zoom» and «… Zoom 2» exist.
- Expect: «2026.10.21-1430 Zoom 3».
- Evidence: the suite at the head.

### S-6 A title with characters a folder cannot hold

- Drive: title «Q3/Q4 план».
- Expect: «2026.10.21-1430 Q3-Q4 план»; a folder by that name can be created.
- Evidence: the suite at the head.
