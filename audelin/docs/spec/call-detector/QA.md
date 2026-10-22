---
date: 2026-10-22
model: claude-opus-5-5
description: "Call detector — QA"
---

# Call detector — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `3949553674db236abccc7bfe8cb210765bd22522` |
| driven by | integration tests of the adapter on this Mac, with real apps |
| where | this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 An app takes the microphone

- Drive: start a Zoom test call, noting the time Zoom's microphone light comes on.
- Expect: within 2 s, an event naming `us.zoom.xos` stamped within 1 s of the noted time.
- Evidence: Missing.

### S-2 An app releases the microphone

- Drive: leave the Zoom call, noting the time the microphone light goes off.
- Expect: within 2 s, a release event naming `us.zoom.xos` stamped within 1 s of the noted time.
- Evidence: Missing.

### S-3 A browser

- Drive: open a microphone test page in Chrome and allow it.
- Expect: an event naming `com.google.Chrome`.
- Evidence: Missing.

### S-4 Audelin itself

- Drive: start the mic capture adapter in the same process.
- Expect: no event in the 10 s that follow.
- Evidence: Missing.

### S-5 Apps already on the microphone

- Drive: join a Zoom test call; then start the detector.
- Expect: an event naming Zoom within 2 s of the start.
- Evidence: Missing.

### S-6 A second app joins

- Drive: in a Zoom test call, open a microphone test page in Chrome.
- Expect: an event naming `com.google.Chrome`; no event for Zoom in the 10 s that follow, both still on the microphone.
- Evidence: Missing.

### S-7 One of two apps releases

- Drive: from S-6, leave the Zoom call.
- Expect: a release naming `us.zoom.xos`; no release for Chrome in the 10 s that follow.
- Evidence: Missing.
