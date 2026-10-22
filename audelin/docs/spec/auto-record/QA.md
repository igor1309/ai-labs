---
date: 2026-10-22
model: claude-opus-5-5
description: "Auto-record — QA, driven as the user with real call apps"
---

# Auto-record — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `8d6a3dc49053fe6b92aad2b3005e818182319a48` |
| driven by | the user, through the menu and real call apps |
| where | the release build on this Mac; call-end time 30 s (mvp.md § Edge cases) |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 A call app taking the microphone starts a recording

- Drive: auto-record ticked, nothing recording; join a Zoom call.
- Expect: within a few seconds the menu shows a recording and a new call folder appears.
- Evidence: Missing.

### S-11 Telemost starts a recording

- Drive: auto-record ticked, nothing recording; join a call in the Telemost app.
- Expect: the menu shows a recording; a new call folder appears.
- Evidence: Missing.

### S-2 A browser call starts a recording

- Drive: auto-record ticked, nothing recording; join a Google Meet call in Chrome.
- Expect: a recording runs; the menu reads «Запись · Chrome».
- Evidence: Missing.

### S-3 A call that ends stops its recording

- Drive: after S-1, leave the call; watch the menu for 40 s.
- Expect: the recording runs for 30 s after leaving, then the menu reads «Ждёт звонка».
- Evidence: Missing.

### S-4 A call app back within the call-end time keeps the recording

- Drive: after S-1, leave the call and rejoin within 20 s.
- Expect: one recording, one folder; its time never reset.
- Evidence: Missing.

### S-5 Auto-record off records nothing on its own

- Drive: auto-record unticked, nothing recording; join a Zoom call.
- Expect: the menu reads «Не записывает»; no folder appears.
- Evidence: Missing.

### S-6 A recording by hand ignores the call ending

- Drive: auto-record ticked, no call app open; «Начать запись»; join a Zoom call, leave it and wait 40 s.
- Expect: one recording throughout, still running after the 40 s.
- Evidence: Missing.

### S-7 A recording stopped by hand stays stopped during the call

- Drive: S-1, then «Остановить запись»; stay in the call two minutes.
- Expect: nothing records while the call goes on.
- Evidence: Missing.

### S-8 The next call records after a manual stop

- Drive: S-7, then leave, wait 40 s and join another Zoom call.
- Expect: a new recording and a new folder.
- Evidence: Missing.

### S-9 Ticking auto-record during a call records it

- Drive: auto-record unticked, nothing recording; join a Zoom call; check the menu shows nothing recording; tick auto-record in the menu.
- Expect: «Запись · Zoom» within a few seconds.
- Evidence: Missing.

### S-10 Unticking auto-record keeps the call's recording

- Drive: S-1, untick auto-record, stay a minute, then leave the call.
- Expect: the recording runs on, and stops 30 s after leaving.
- Evidence: Missing.
