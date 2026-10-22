---
date: 2026-10-22
model: claude-opus-5-5
description: "Auto-recorder — QA"
---

# Auto-recorder — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `964e58aaf2a9a04b5a9d9745e81ae4b6a6a92015` |
| driven by | tests of the auto-recorder through a fake call watcher, a fake recording session and a fake activity gate |
| where | `swift test` on this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 A call starts a recording

- Drive: auto-record on; the fake watcher emits a call started in Zoom.
- Expect: the fake session gets one start titled «Zoom»; the client state is recording that Zoom call.
- Evidence: Missing.

### S-2 Auto-record off

- Drive: auto-record off; the watcher emits a call start.
- Expect: the session gets no start; the client state is idle.
- Evidence: Missing.

### S-3 The call ends

- Drive: from S-1, the watcher emits the call's end.
- Expect: the session gets one stop; the client state is idle.
- Evidence: Missing.

### S-4 A recording by hand outlasts the call

- Drive: start through the session by hand; the watcher emits a call start, then its end.
- Expect: the session gets no stop and no second start; the client state is the same recording throughout.
- Evidence: Missing.

### S-5 A stop by hand holds until the call ends

- Drive: from S-1, stop by hand; the watcher keeps the call on and re-emits its app on the microphone.
- Expect: no new start until the call's end; the client state is idle throughout.
- Evidence: Missing.

### S-6 The next call records again

- Drive: from S-5, the watcher emits the end, then a new call start.
- Expect: the session gets a new start; the client state is recording the new call.
- Evidence: Missing.

### S-7 Turning auto-record on mid-call

- Drive: auto-record off; the watcher has a call on; turn it on.
- Expect: the session gets one start at once; the client state is recording that call.
- Evidence: Missing.

### S-8 Turning auto-record off mid-call

- Drive: from S-1, turn auto-record off; then the watcher emits the end.
- Expect: no stop when turned off and the client state stays recording; one stop at the call's end, then idle.
- Evidence: Missing.

### S-9 A call during a folder move

- Drive: the fake gate is held by a move; the watcher emits a call start.
- Expect: the session gets no start; the client gets a refusal with the move as its reason.
- Evidence: Missing.
