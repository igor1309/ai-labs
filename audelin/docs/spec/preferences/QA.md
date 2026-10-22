---
date: 2026-10-22
model: claude-opus-5-5
description: "Preferences — QA"
---

# Preferences — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `8ca7454f336bd7a740f2ce416ffad83fbfb2bdf2` |
| driven by | tests of the preferences core through a fake settings store and a fake build flag |
| where | `swift test` on this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 Both switches on by default

- Drive: an empty fake settings store; read both switches.
- Expect: auto-record on; live text on.
- Evidence: Missing.

### S-2 A switch change reaches every client

- Drive: subscribe two observers; untick live text through the first.
- Expect: the second observer gets live text off in the same run loop turn.
- Evidence: Missing.

### S-3 Switches survive a relaunch

- Drive: untick auto-record; open a new core on the same store.
- Expect: auto-record reads off.
- Evidence: Missing.

### S-4 The default chunk size

- Drive: build flag release; read the chunk size; try to set 8 s.
- Expect: 4 s; the set is rejected.
- Evidence: Missing.

### S-5 A chunk size change waits for the next recording

- Drive: build flag debug; a fake session recording; set 8 s; stop; start a new recording.
- Expect: the core's chunk size reading gives 8 s set and 4 s in use while recording; the fake session's running recording keeps 4 s; after stop and start, the reading and the new recording both give 8 s.
- Evidence: Missing.

### S-6 Changing the chunk size while idle

- Drive: build flag debug, nothing recording; read the chunk size, set 8 s, read again, open a new core on the same store.
- Expect: 4 s, then 8 s, then 8 s after the reopen.
- Evidence: Missing.
