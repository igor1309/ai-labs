---
date: 2026-10-22
model: claude-opus-5-5
description: "Audelin v1 — what the user can do with the app across a call: record it, read both sides live, keep it, and recover from what goes wrong"
---

# Audelin v1 — spec

## Oracle

Blobs at `550b87a7`:

| File | Blob |
|---|---|
| [mvp.md](../mvp.md) | `bfdf8a6f50ec4393216894472caf1702603aa116` |
| [design/README.md](../design/README.md) | `a22ede639d26c037ce772999fe56c7e9694ac61f` |
| [design/visual-language.pen](../design/visual-language.pen) | `3e72861f0f45ce4b996c244d9b11319772470a34` |
| [adr-001-v1-architecture.md](../adr-001-v1-architecture.md) | `25ec54e4873b9776f67cd00b87cc8358280b7c2d` |

## Decided

Gaps in the oracle, closed by the agent (research, then challenged by Codex,
2026-10-22). The owner may overturn any of them.

1. The user can read a word unconfirmed within 3 s of its end and confirmed
   within 10 s, with the model ready and recognition keeping up (S-6). The
   live windows' cadence allows it; LAB-408 measures it on a real call.
2. A recording started by hand with no call app on the microphone is titled
   «Звонок» (S-28): the UI is Russian, and the title is editable.
3. A browser is a call app when it is Safari, Chrome, Arc, Firefox, Edge,
   Yandex Browser, Brave or Opera (S-29). A fixed list, because the apps
   macOS lists as opening https links include non-browsers.
4. With two call apps on the microphone, the title is the app that started
   the recording; for a manual start, the one seen taking the microphone
   first (S-30).
5. A recording the call started and the user stopped by hand stays stopped
   until the call ends; the next call records again (S-31, S-32).
6. Ticking «Записывать звонки автоматически» while a call app uses the
   microphone starts recording at once (S-33): ticking it is a request to
   record.
7. If one track cannot be captured, recording goes on with the other and
   names the missing side (S-34, S-35), as Screen 8 draws: stopping would
   lose the side that works, against mvp.md's record-first rule.
8. Debug builds add two test triggers to the menu: hold the recogniser, and
   request a folder move and a recording at the same moment (S-18, S-25).
   Release builds do not have them. mvp.md already keeps a debug-only
   setting (chunk size).

## Observer

The user: the owner, or an agent running the app on this Mac. They see the
menu bar item, the live panel, the calls list, settings and the call
folders in Finder.

## Non-goals

- The final pass, summaries, bb explanations and the ⌃⌥⌘E hotkey, calendar
  titles, Import, and the final-pass engine in setup (v2–v3).
- Audio compaction into one stereo file, the 7-day retention, pinning, and
  "Распознать заново" (v3 and Later).
- A background service, CLI or agent access other than through the app's
  windows and the call folders (ADR-001 § Non-goals).
- Echo cancellation: calls are taken on headphones.
- Resuming the live transcript of the same call after a crash.

## Specs it composes

What each window offers is in its own spec, and is not repeated here:

- the live panel: [live-session-ui](live-session-ui/SPEC.md);
- the menu bar item, the calls list and the call screen:
  [calls-ui](calls-ui/SPEC.md);
- first-launch setup, the launch check and settings: [setup-ui](setup-ui/SPEC.md).

The selection scenarios ADR-001's acceptance asks for are the live panel's
(live-session-ui S-14 to S-16), and deleting a call while its text catches
up is the calls list's (calls-ui).

This spec holds what crosses them: a call from start to the calls list,
and what the user keeps when something fails.

## Behaviour

```gherkin
Feature: The user records a call, reads it live and keeps it

  Rule: A call is recorded

  Scenario: S-1 A call app taking the microphone starts a recording
    Given «Записывать звонки автоматически» is ticked
    And no recording is running
    When Zoom starts using the microphone
    Then the user can see from the menu bar that a recording named after Zoom is running
    And the user can read the call in the live panel

  Scenario: S-2 A call that ends stops its recording
    Given a recording that Zoom's call started
    When no call app has used the microphone for the call-end time
    Then the user can see from the menu bar that nothing is recording
    And the user can find the call in the calls list
    And the user can still read the call's text in the live panel

  Scenario: S-3 The user records by hand
    Given «Записывать звонки автоматически» is not ticked
    And Zoom uses the microphone
    When the user starts a recording from the menu
    Then the user can see a recording named after Zoom running

  Scenario: S-4 A recording started by hand ignores the call ending
    Given a recording the user started by hand while Zoom used the microphone
    When no call app has used the microphone for the call-end time
    Then the user can see that the recording is still running

  Scenario: S-5 Auto-record off records nothing on its own
    Given «Записывать звонки автоматически» is not ticked
    When Zoom starts using the microphone
    Then the user can see from the menu bar that nothing is recording

  Scenario: S-28 A recording by hand with no call app
    Given no call app uses the microphone
    When the user starts a recording from the menu
    Then the user can see a recording running under the default title

  Scenario: S-29 A browser call starts a recording
    Given «Записывать звонки автоматически» is ticked
    And no recording is running
    When Chrome starts using the microphone
    Then the user can see from the menu bar that a recording named after Chrome is running

  Scenario: S-30 Two call apps on the microphone
    Given Zoom took the microphone before Telemost and both still use it
    And no recording is running
    When the user starts a recording from the menu
    Then the user can see a recording named after Zoom running

  Scenario: S-31 A recording stopped by hand stays stopped during the call
    Given a recording that Zoom's call started
    When the user stops it from the menu while Zoom still uses the microphone
    Then the user can see from the menu bar that nothing is recording until the call ends

  Scenario: S-32 The next call records again after a manual stop
    Given the user stopped by hand a recording that Zoom's call started
    And no call app has used the microphone for the call-end time
    When Zoom starts using the microphone again
    Then the user can see from the menu bar that a new recording is running

  Scenario: S-33 Ticking auto-record during a call records it
    Given «Записывать звонки автоматически» is not ticked
    And Zoom uses the microphone
    And no recording is running
    When the user ticks «Записывать звонки автоматически»
    Then the user can see from the menu bar that a recording named after Zoom is running

  Rule: The user reads along

  Scenario: S-6 Both sides appear while the call goes on
    Given a recording with «Живой текст» ticked and the live model ready
    When the owner and the other side speak
    Then the user can read the owner's words marked «я» while the call goes on
    And the user can read the other side's words marked «они» while the call goes on

  Scenario: S-7 English terms in Russian speech read as spoken
    Given a recording with «Живой текст» ticked and the live model ready
    When the owner says RACI, OKR and SLA in a Russian sentence
    Then the user can read RACI, OKR and SLA in Latin letters in the live panel

  Scenario: S-11 The last words before Stop are kept
    Given a recording with «Живой текст» ticked and the live model ready
    When the owner speaks and the user stops the recording at once
    Then the user can read the owner's last words in the call's text

  Scenario: S-12 Live text switched off keeps the text so far
    Given a recording with text in the live panel
    When the user unticks «Живой текст»
    Then the user can see that the call is only being recorded
    And the user can still read the text from before the switch

  Scenario: S-13 Live text switched on fills the minutes already recorded
    Given a recording with «Живой текст» not ticked and the live model ready
    When the user ticks «Живой текст»
    Then the user can read the minutes already recorded, marked «дописано позже»
    And the user can read the call live from then on

  Scenario: S-14 A call recorded without live text has its audio only
    Given a recording with «Живой текст» not ticked throughout
    When the recording stops
    Then the user can find the call and its audio in the calls list
    And the user can see that the call has no live text

  Rule: The call is kept

  Scenario: S-15 Stop does not wait for recognition
    Given a recording whose recognition has fallen behind
    When the user stops the recording
    Then the user can find the call in the calls list without waiting for recognition
    And the user can later read the whole call's text

  Scenario: S-16 Each call has its own folder
    Given a call in the calls list
    When the user opens the calls folder in Finder
    Then the user can find the call's folder by its start time and title

  Scenario: S-17 A call renamed in Finder stays the same call
    Given a call in the calls list
    When the user renames its folder in Finder
    Then the user can find the same call in the calls list under the new title

  Rule: Nothing recorded is lost

  Scenario: S-18 A stalled recogniser does not stop recording
    Given a recording with «Живой текст» ticked and the live model ready
    When the recogniser stops responding
    Then the user can see the recording go on
    And the user can later read the stalled minutes' text with no words twice and none missing

  Scenario: S-19 A crash keeps the call
    Given a recording is running
    When the app crashes and the user opens it again
    Then the user can find the call in the calls list with its audio up to the crash
    And the user can read its text once recognition has caught up, with no words twice and none missing

  Scenario: S-20 A call started before the live model is ready
    Given the live model is still downloading
    And «Живой текст» is ticked
    When the user starts a recording
    Then the user can see that the call is recorded and live text waits for the model
    And once the model is ready the user can read the minutes already recorded, marked «дописано позже»

  Scenario: S-21 A full disk stops the recording and keeps what was written
    Given a recording is running
    When the disk becomes full
    Then the user can see that recording failed and when it stopped
    And the user can play and read everything recorded before the stop
    And the user cannot start a new recording until there is room

  Scenario: S-22 An interruption shows as a gap
    Given a recording with «Живой текст» ticked and the live model ready
    When the Mac sleeps and wakes during the call
    Then the user can see a gap in the call's text where audio was missing
    And the user can read the last words spoken before the gap
    And the user can see no sentence joined across the gap

  Scenario: S-34 The call audio cannot be captured
    Given call audio cannot be captured
    And «Живой текст» is ticked and the live model is ready
    When a recording starts
    Then the user can read the owner's words live
    And the user can play the owner's side of the call afterwards

  Scenario: S-35 The microphone cannot be captured
    Given the microphone cannot be captured
    And «Живой текст» is ticked and the live model is ready
    When a recording starts
    Then the user can read the other side's words live
    And the user can play the other side of the call afterwards

  Scenario: S-36 The microphone device changes mid-call
    Given a recording with «Живой текст» ticked and the live model ready
    When the user unplugs the headset the microphone was using
    Then the user can see the recording go on from the new input
    And the user can see a gap in «я» with no sentence joined across it

  Scenario: S-37 A permission is withdrawn mid-call
    Given a recording with «Живой текст» ticked and the live model ready
    When the microphone permission is withdrawn
    Then the user can see the recording go on for «они»
    And the user can read and play «я» up to the moment it was withdrawn

  Scenario: S-38 The call's text cannot be saved
    Given a recording with «Живой текст» ticked and the live model ready
    When the call's text can no longer be saved to its folder
    Then the user can see the recording go on and its text marked incomplete
    And the user can play the whole call afterwards

  Scenario: S-39 A new recording interrupts catch-up
    Given a stopped call whose text is still catching up
    When a call app starts a new recording
    Then the user can see the new call recording
    And the user can later read the earlier call's whole text

  Scenario: S-40 A folder move interrupts catch-up
    Given a stopped call whose text is still catching up
    When the user moves the calls folder
    Then the user can see the move run
    And the user can later read the earlier call's whole text in the new folder

  Rule: The calls folder belongs to one activity at a time

  Scenario: S-23 No folder move during a recording
    Given a recording is running
    When the user tries to change the calls folder
    Then the user can see that the folder can be changed after the call

  Scenario: S-24 No recording during a folder move
    Given the calls folder is being moved
    When Zoom starts using the microphone
    Then the user can see that the call is not being recorded and why

  Scenario: S-25 A move and a recording requested at the same moment
    Given no recording is running and no move is running
    When the user confirms a folder move at the moment a call starts a recording
    Then the user can see exactly one of them running

  Rule: Setup

  Scenario: S-26 A fresh install reaches a working live panel
    Given Audelin has never run on this Mac
    When the user completes setup
    Then the user can record a call and read it live

  Scenario: S-27 A missing live model is reported at launch
    Given the live model's files are gone since the last launch
    When the user opens the app
    Then the user can see that the live model is missing before any call
```
