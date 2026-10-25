# Recorded capture

Observer: the client compose gives one side to, which starts and stops it
for Session (`../session/SPEC.md`), hears it live for call text
(`../call-text/SPEC.md`) and is told when the side fails. A decorator at
the root over one capture and its track (`../../app-shape.md`).

## Decided

- **A decorator of its own, not compose's:** compose decides nothing
  (ARCHITECTURE rule 4) and both capture specs leave the file to others.
  It owns its interfaces for the capture and the track's writing.
- **Live audio never waits for the track** (call text, Decided; LAB-551).
- **A piece's time is the audio captured before it:** pieces carry no
  time (system audio capture) and a track starts at its first sample
  (track file), so live and written agree.
- **A failure is told when it happens, as the track's or the capture's,**
  so Session names the side while the other records (Session S-5, S-6).
  A failed write also ends the side: capturing on would keep audio no
  track holds (track file S-10). A failed capture still has every piece
  it gave written and heard, after the news.
- **Stopping returns once the last piece is written,** even when the
  capture's stop fails, so Session closes the track after its last audio.
  The stop a failed write makes fails at once, as the capture; only the
  stop I ask for fails at my stop, so each failure is told once.
- **One live listener, who may listen before the start:** Session starts
  call text first to keep the first audio (Session, Decided), and call
  text runs one live text per track; a second listener hears nothing.
- **A slow track is waited for in memory, without a bound:** dropping
  audio would shift all later audio (track file, Decided), and the
  captures already buffer without a bound.
- **A capture that does not start** writes nothing and ends its live
  audio, so a listener is not left waiting.

```gherkin
Feature: Recording a capture to its track

  Scenario: S-1 Captured audio is heard live and kept
    Given a recorded capture that is running
    When the capture gives audio
    Then I can hear it live, and read it back from the track

  Scenario: S-2 Live audio does not wait for the track
    Given a recorded capture whose track is slow to write
    When the capture gives audio
    Then I can hear it before it is written

  Scenario: S-3 Audio keeps its place in time
    Given a recorded capture that has given audio
    When it gives more
    Then I hear it at the time the track holds it

  Scenario: S-4 Stopping keeps the last audio
    Given a recorded capture whose last audio is not yet written
    When I stop it
    Then I can read all of its audio from the track once the stop returns

  Scenario: S-5 Stopping ends live audio
    Given a recorded capture I am hearing
    When I stop it
    Then I hear all of its audio, then the end

  Scenario: S-6 A failed write ends the side
    Given a recorded capture that is running
    When writing to its track fails
    Then I can tell the track failed, before any stop
    And I hear the end of its live audio
    And I can read every piece written before

  Scenario: S-7 A failed capture keeps what it gave
    Given a recorded capture that gave audio
    When the capture fails
    Then I can tell the capture failed, before any stop
    And I can read all the audio it gave, and hear it, then the end

  Scenario: S-11 A capture failure is told while its track is slow
    Given a recorded capture whose track is slow to write
    When the capture fails
    Then I can tell the capture failed before its audio is written

  Scenario: S-8 A failed stop keeps what was given
    Given a recorded capture that gave audio
    When stopping its capture fails
    Then I can tell the stop failed
    And I can read all the audio it gave once the stop returns

  Scenario: S-13 A failed write's own stop is told when it fails
    Given a recorded capture whose capture will not stop
    When writing to its track fails
    Then I can tell the track and the capture failed, before any stop

  Scenario: S-9 A second listener hears nothing
    Given a recorded capture I am hearing
    When I listen again
    Then I can tell the second listening ended without audio
    And I go on hearing the capture through the first

  Scenario: S-12 A listener from before the start hears the first audio
    Given I am listening to a recorded capture not yet started
    When I start it and it gives audio
    Then I can hear its first audio

  Scenario: S-10 A capture that does not start fails
    When the capture will not start
    Then I can tell the start failed, and I hear the end of its live audio
```
