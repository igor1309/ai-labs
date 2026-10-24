# Session

Observer: compose, which builds a Session on the machine loop for each
recording, ends it when Recording asks, and hands its state to Recording
and the panel (`../../app-shape.md`): what records, how live text does,
what failed (user S-8, S-9, S-15, S-16, S-7, S-17 in `../SPEC.md`).

## Decided

- **Bring-up puts each destination before its source:** the call's folder,
  the call app's processes, the track files, the transcript, call text,
  then the captures, so the first audio and text are kept (S-1, S-15).
- **Bring-down keeps everything:** captures stop first, each track file
  closes after its last audio, call text finishes, the transcript closes
  after its last text, so a call is kept to its last word (S-7, S-17).
- **Ended means nothing is left:** an end waits for the step in flight.
- **A piece failing to close is named;** bring-down goes on, what was kept
  stays, and the Session still ends, so the next call is never stranded.
- **A failure that leaves no track** (the folder, or both sides) makes it
  say it cannot record, and why; Recording ends it (LAB-510). Any other
  failing piece, or a side whose access is lost (compose feeds each side's
  access), is named, its output kept, and the rest goes on (S-9).
- **Live text is the Session's own:** it starts from the preference, and
  the preference or panel switch changes it, as call text says (S-8).
  Getting ready is call text's, shown beside the tracks (S-15, S-16).

```gherkin
Feature: Bringing a recording up and down

  Scenario: S-1 Both sides are recorded
    Given a Session begins
    When every piece comes up
    Then I can read that both tracks are recording, from their first audio

  Scenario: S-2 Ending keeps everything recorded
    Given a Session is recording
    When it is ended
    Then I can read that it ended, with every piece's audio and text kept

  Scenario: S-3 Ending during bring-up brings down only what came up
    Given a Session part way through bring-up
    When it is ended
    Then I can read that it ended, with only the pieces that came up brought down

  Scenario: S-4 A piece that comes up after the end is brought down
    Given a Session ended while a piece was still coming up
    When that piece comes up
    Then I can read that it ended only after that piece is down too

  Scenario: S-5 A failure that leaves no track is told
    Given a Session has begun
    When a failure leaves no track able to record
    Then I can read that it cannot record and why, with what it kept

  Scenario: S-6 Any other failure keeps the rest
    Given a Session has begun
    When a piece fails and a track can still record
    Then I can read which failed, that what it kept stays, and that the rest records

  Scenario: S-7 Live text gets ready while the call records
    Given call text is getting ready
    When the Session is recording
    Then I can read that both tracks are recording and live text is getting ready

  Scenario: S-8 Live text switched off
    Given a Session is recording with live text on
    When the user switches live text off
    Then I can read that live text is off and both tracks are recording

  Scenario: S-9 Live text switched on
    Given a Session is recording with live text off
    When the user switches live text on
    Then I can read that live text is on

  Scenario: S-10 The preference switched off applies to the running Session
    Given a Session is recording with live text on
    When live text is switched off in Settings
    Then I can read that live text is off

  Scenario: S-11 The preference switched on applies to the running Session
    Given a Session is recording with live text off
    When live text is switched on in Settings
    Then I can read that live text is on

  Scenario: S-12 The preference starts the Session
    Given live text is off in Settings
    When a Session begins
    Then I can read that its live text is off

  Scenario: S-13 A piece failing to close is named
    Given a Session is being ended
    When a piece fails to close
    Then I can read that it ended, which failed, and with what was kept
```
