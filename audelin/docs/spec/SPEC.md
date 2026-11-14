# Audelin

Observer: the user, who records calls and reads them live.

```gherkin
Feature: Live text of calls

  Background:
    Given Audelin is set up and able to record

  Scenario: S-1 Recording starts by itself
    Given automatic recording is on
    When a call starts in Zoom, Telemost or a browser
    Then both sides of the call are being recorded without my doing anything

  Scenario: S-2 Manual start
    Given no recording is running and no call is on
    When I start recording by hand
    Then both sides are recorded until I stop it

  Scenario: S-17 A manual recording ends with its call
    Given I started recording by hand during a call
    When the call ends
    Then recording stops by itself, and the call's audio and transcript are kept

  Scenario: S-3 Live text for both sides
    Given a call is being recorded with live text on
    When either side speaks
    Then I can read what was said while it is being said, marked as mine or theirs

  Scenario: S-7 Recording stops when the call ends
    Given a call was started by itself
    When the call ends
    Then recording stops by itself, and the call's audio and transcript are kept

  Scenario: S-8 Live text can be switched off
    Given a call is being recorded with live text on
    When I switch live text off
    Then no new live text appears, the text so far stays, and the call is still recorded

  Scenario: S-9 The call is never lost to recognition
    Given a call is being recorded
    When live text fails
    Then the whole call is still recorded

  Scenario: S-15 Live text catches up after the models load
    Given a call starts while the speech models are still loading
    When they finish loading
    Then I can read what was said from the call's start

  Scenario: S-10 Renaming a call
    Given a recorded call
    When I change its title in the app
    Then the call's folder carries the new title, keeps its date and time in front, and the call is still the same call

  Scenario: S-18 Deleting a call
    Given a recorded call
    When I delete it in the app and confirm
    Then its folder is gone, with its audio and transcript

  Scenario: S-19 Changing the calls folder
    Given recorded calls in the calls folder
    When I pick another folder and confirm the move
    Then every call is in the new folder, still the same call, and new calls are recorded there

  Scenario: S-20 Opening Audelin again during a call shows the panel
    Given Audelin is recording a call
    When I open Audelin again from Finder, Spotlight or the Dock
    Then the transcript panel shows in front, also when I had closed it

  Scenario: S-21 Opening Audelin again between calls shows the calls
    Given Audelin is running and no call is recording
    When I open Audelin again
    Then the calls list shows

  Scenario: S-22 Merging calls that were one call
    Given one call was saved as several because it was cut off
    When I merge them in the calls window
    Then I can read them as one call with one set of notes
```

Opening a running menu bar app again is the way back to it when its icon is
hidden, as under the notch of a crowded menu bar; menu bar apps such as
Maccy and Stats answer it by showing their main window.

## Menu bar

While recording or ending, the menu bar appends
“Звук звонка не слышен — проверьте доступ к записи звука” after any recording
faults when the call side stays exact zeros while the user talks. This
usually means System Audio Recording permission has been revoked. The
warning does not stop recording; it disappears when call audio returns or
the recording ends, and does not return during that recording.

Panel presentation is owned by `live-panel/SPEC.md`; recording-problem copy and colours remain in the design brief.
Optional post-call notes are owned by `call-summaries/SPEC.md`; recording and notes are independent.
The calls window is owned by `calls-window/SPEC.md`, choosing a call in it by `calls-list/SPEC.md`, reading it beside the list by `summary-preview/SPEC.md`, making its notes on request by `call-notes/SPEC.md`.
Installed-update notification and call-safe restart are owned by `installed-update/SPEC.md`.
Merging calls is owned by `merge-calls/SPEC.md`.
