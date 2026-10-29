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

  Scenario: S-4 Text settles in place
    Given a phrase is still being recognised
    When its recognition firms up
    Then the phrase changes where it stands, and the text I'm reading above it doesn't jump

  Scenario: S-5 A selection is held
    Given I've selected part of the transcript
    When new text arrives or the selected phrase settles differently
    Then I keep exactly the text I selected, and the panel shows it's held

  Scenario: S-11 Held selections add up
    Given I hold a selection
    When I select another part of the transcript
    Then I hold both, and the panel shows each as held

  Scenario: S-12 A click keeps what is held
    Given I hold a selection
    When I click in the transcript
    Then I still hold it

  Scenario: S-13 Letting go of a held selection
    Given I hold several selections
    When I let one of them go
    Then I hold only the others

  Scenario: S-14 A held selection leaves the transcript
    Given I've selected part of the transcript
    When I finish selecting
    Then I hold it, and the selection fades from the transcript

  Scenario: S-6 The panel stays visible beside the call
    Given a call window is in front
    When I work in the call app
    Then I can still see the transcript panel over it

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

  Scenario: S-16 The panel says live text is getting ready
    Given a call is being recorded and the speech models are still loading
    When I look at the panel
    Then I see that live text is getting ready and the call is already recorded

  Scenario: S-10 Renaming a call
    Given a recorded call
    When I change its title in the app
    Then the call's folder carries the new title, keeps its date and time in front, and the call is still the same call
```

## Menu bar

While recording or ending, the menu bar appends
“Звук звонка не слышен — проверьте доступ к записи звука” after any recording
faults when the call side stays exact zeros while the user talks. This
usually means System Audio Recording permission has been revoked. The
warning does not stop recording; it disappears when call audio returns or
the recording ends, and does not return during that recording.
