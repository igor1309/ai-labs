# Fill in

Observer: side text, which fills in each time its live text has missed
audio: from the call's start while live text gets ready, and from the
start again when it is switched on (side-text S-2, S-4, S-6, S-9, S-11, S-13).

Fill in gets one side's live text ready and has it hear, from the side's
written track, the audio it missed, up to where the live audio has
reached, through interfaces of its own. It knows no device, file or model.

## Decided

- A component of its own: getting ready and catching up have their own
  holds, failures and abandonment, and in side text they did not fit
  (LAB-554, 2026-10-25).
- The written track is read only for what live text did not hear: the
  start of a call heard while the models load, and a call switched on
  mid-call (call text's Decided, moved here).
- It reads up to where the live audio has reached when it starts, and on
  to the audio's end when the audio has ended, so nothing is heard twice
  or missed (live-audio S-9).
- Text it fills in after a switch on is marked as written later.
- Abandoning ends it at once with the text so far, without waiting for a
  load or a read in flight.
- A failure, getting ready, reading or hearing, keeps the text so far and
  is told.

```gherkin
Feature: Filling in what one side's live text missed

  Scenario: S-1 Getting ready, then reading from the start
    Given audio written while live text gets ready
    When it is ready
    Then I can read the text from the call's start, in order

  Scenario: S-2 Switched on, it fills in from the start
    Given audio written while live text is off
    When I fill in after a switch on
    Then I can read the text from the start, marked written later

  Scenario: S-3 Audio ending while getting ready is read to its end
    Given live text getting ready
    When the audio ends, and then it is ready
    Then I can read the text of all the audio

  Scenario: S-4 Audio ending while catching up is read to its end
    Given live text catching up
    When the audio ends, and then the read goes on
    Then I can read the text of all the audio

  Scenario: S-5 Abandoned while getting ready
    Given live text getting ready
    When I abandon it
    Then I can tell it ended with no text, before it is ready

  Scenario: S-6 Abandoned while catching up
    Given live text catching up
    When I abandon it
    Then I can tell it ended with the text so far, before it caught up

  Scenario: S-7 Failing to get ready
    Given live text getting ready
    When getting it ready fails
    Then I can tell it failed

  Scenario: S-8 Failing to read the written track
    Given live text catching up
    When reading the written track fails
    Then I can tell it failed, and read the text so far

  Scenario: S-9 Live text failing while catching up
    Given live text catching up
    When it fails hearing what was read
    Then I can tell it failed, and read the text so far
```
