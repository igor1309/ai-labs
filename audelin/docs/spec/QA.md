---
date: 2026-10-22
model: claude-opus-5-5
description: "Audelin v1 — QA against spec/SPEC.md, driven as the user: the built app on this Mac, real calls and injected faults"
---

# Audelin v1 — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `51e0aa47f12c1cc2050e572d9b86c00d083a96c8` |
| driven by | the user: the owner, or an agent through the app's windows and the call folders |
| where | the release build on this Mac; Zoom calls between this Mac and a second device, with the owner speaking Russian with English terms |

## Scenarios

One row per [SPEC.md](SPEC.md) scenario, headed by its id and its name verbatim
from there. Verdicts live in a run report under `runs/`, never here. A row has
evidence or it reads Missing.

### S-1 A call app taking the microphone starts a recording

- Drive: auto-record ticked, nothing recording; join a Zoom call.
- Expect: the menu bar shows a recording; the calls list and the folder name carry «Zoom»; the panel shows the call's words.
- Evidence: Missing.

### S-2 A call that ends stops its recording

- Drive: end the Zoom call from S-1 and wait past the call-end time.
- Expect: the menu bar shows nothing recording; the call is in the calls list; the panel still shows its text.
- Evidence: Missing.

### S-3 The user records by hand

- Drive: auto-record unticked; join a Zoom call; choose Start recording in the menu.
- Expect: a recording named «Zoom» runs.
- Evidence: Missing.

### S-4 A recording started by hand ignores the call ending

- Drive: S-3, then end the Zoom call and wait past the call-end time.
- Expect: the recording is still running.
- Evidence: Missing.

### S-5 Auto-record off records nothing on its own

- Drive: auto-record unticked; join a Zoom call.
- Expect: nothing records; no call folder appears.
- Evidence: Missing.

### S-6 Both sides appear while the call goes on

- Drive: a Zoom call; the owner and the other device take turns reading a script.
- Expect: each side's words appear under «я» and «они», unconfirmed within 3 s of each word's end and confirmed within 10 s, measured against the script's timestamps on both tracks, the last word before a silence included.
- Evidence: Missing.

### S-7 English terms in Russian speech read as spoken

- Drive: the owner reads Russian sentences containing RACI, OKR and SLA.
- Expect: the panel and the call's text show RACI, OKR and SLA in Latin letters.
- Evidence: Missing.

### S-11 The last words before Stop are kept

- Drive: the owner says a marked phrase and presses Стоп right after it.
- Expect: the call's text ends with the marked phrase.
- Evidence: Missing.

### S-12 Live text switched off keeps the text so far

- Drive: mid-call, untick «Живой текст».
- Expect: the panel says the call is only recorded; the text before the switch stays, and its last spoken phrase is there.
- Evidence: Missing.

### S-13 Live text switched on fills the minutes already recorded

- Drive: start a call with «Живой текст» unticked, talk for two minutes, tick it.
- Expect: the first two minutes appear marked «дописано позже»; live text follows.
- Evidence: Missing.

### S-14 A call recorded without live text has its audio only

- Drive: record a call with «Живой текст» unticked throughout.
- Expect: the call and its audio are in the calls list; it shows no live text.
- Evidence: Missing.

### S-15 Stop does not wait for recognition

- Drive: a call recorded while recognition lags (model arrived late, as in S-18), then Стоп.
- Expect: the call is listed at once; its text completes afterwards.
- Evidence: Missing.

### S-16 Each call has its own folder

- Drive: after a call, Open Calls Folder from the menu.
- Expect: one folder for the call, named by its start time and title.
- Evidence: Missing.

### S-17 A call renamed in Finder stays the same call

- Drive: rename a call folder's title in Finder, then reopen the calls list.
- Expect: the same call, with its text and audio, under the new title.
- Evidence: Missing.

### S-18 A stalled recogniser does not stop recording

- Drive: a debug build; mid-call, choose the menu's hold-recogniser trigger for a minute while reading a script, then release it.
- Expect: the recording goes on; the stalled minutes' text appears later, matching a script with no word twice or missing.
- Evidence: Missing.

### S-19 A crash keeps the call

- Drive: mid-call, `kill -9` the app; open it again.
- Expect: the call is listed with audio up to the kill; its text completes and matches the script with no word twice or missing.
- Evidence: Missing.

### S-20 A call started before the live model is ready

- Drive: remove the live model, open the app so it downloads, start a recording at once.
- Expect: the panel says live text waits for the model; once it arrives the earlier minutes appear marked «дописано позже».
- Evidence: Missing.

### S-21 A full disk stops the recording and keeps what was written

- Drive: point the calls folder at a small disk image and record until it fills.
- Expect: the panel says recording failed and when; the audio and text up to that time play and read; Начать stays disabled until space is freed.
- Evidence: Missing.

### S-22 An interruption shows as a gap

- Drive: mid-call, sleep the Mac with `pmset sleepnow` right after a marked phrase, then wake it.
- Expect: a gap shows where audio is missing; the marked phrase is before it; no sentence spans it.
- Evidence: Missing.

### S-23 No folder move during a recording

- Drive: during a recording, choose a new calls folder in Settings.
- Expect: the move does not start; Settings says the folder can be changed after the call.
- Evidence: Missing.

### S-24 No recording during a folder move

- Drive: start moving a calls folder large enough to take a minute; join a Zoom call meanwhile.
- Expect: no recording starts; the app says why.
- Evidence: Missing.

### S-25 A move and a recording requested at the same moment

- Drive: a debug build; choose the menu's trigger that requests a folder move and a recording at the same moment, 20 times.
- Expect: each time, exactly one of the two runs and the other is refused with its reason.
- Evidence: Missing.

### S-26 A fresh install reaches a working live panel

- Drive: a macOS user account that has never run Audelin; install and complete setup; record a short call.
- Expect: the call's words appear live.
- Evidence: Missing.

### S-27 A missing live model is reported at launch

- Drive: delete the live model's folder; open the app.
- Expect: the app reports the missing model before any call starts.
- Evidence: Missing.

### S-28 A recording by hand with no call app

- Drive: no call app open; choose Start recording in the menu.
- Expect: a recording titled «Звонок» runs.
- Evidence: Missing.

### S-29 A browser call starts a recording

- Drive: auto-record ticked; join a Google Meet call in Chrome.
- Expect: a recording named «Chrome» runs.
- Evidence: Missing.

### S-30 Two call apps on the microphone

- Drive: join a Zoom call, then a Telemost call in its app; start a recording from the menu.
- Expect: the recording is named «Zoom».
- Evidence: Missing.

### S-31 A recording stopped by hand stays stopped during the call

- Drive: auto-record starts a recording on a Zoom call; choose Stop recording and stay in the call for two minutes.
- Expect: nothing records until the call ends.
- Evidence: Missing.

### S-32 The next call records again after a manual stop

- Drive: S-31, then leave the call, wait past the call-end time and join another Zoom call.
- Expect: a new recording runs.
- Evidence: Missing.

### S-33 Ticking auto-record during a call records it

- Drive: auto-record unticked; join a Zoom call; tick auto-record in the menu.
- Expect: a recording named «Zoom» starts at once.
- Evidence: Missing.

### S-34 The call audio cannot be captured

- Drive: live text on, model ready; revoke the system audio recording permission for Audelin; start a recording and speak.
- Expect: the owner's words appear live; after Stop the call's audio has the owner's side.
- Evidence: Missing.

### S-35 The microphone cannot be captured

- Drive: live text on, model ready; revoke the microphone permission for Audelin; start a recording during a Zoom call.
- Expect: the other side's words appear live; after Stop the call's audio has their side.
- Evidence: Missing.

### S-36 The microphone device changes mid-call

- Drive: record a call on a USB headset's microphone, read a marked phrase, unplug the headset, keep speaking on the built-in microphone.
- Expect: the recording goes on; a gap shows in «я» after the marked phrase; no sentence spans it.
- Evidence: Missing.

### S-37 A permission is withdrawn mid-call

- Drive: mid-call, withdraw Audelin's microphone permission in System Settings.
- Expect: «они» keeps recording; «я» plays and reads up to that moment.
- Evidence: Missing.

### S-38 The call's text cannot be saved

- Drive: mid-call, make the call folder's segment log read-only (`chmod a-w`).
- Expect: the recording goes on; the call shows its text as incomplete; after Stop the whole call plays.
- Evidence: Missing.

### S-39 A new recording interrupts catch-up

- Drive: record a call while the model downloads, stop it as the model arrives so catch-up starts, and start a new recording at once.
- Expect: the new call records; after it, the earlier call's text completes and matches its script.
- Evidence: Missing.

### S-40 A folder move interrupts catch-up

- Drive: as S-39, but change the calls folder instead of recording.
- Expect: the move completes; the earlier call's text then completes in the new folder.
- Evidence: Missing.
