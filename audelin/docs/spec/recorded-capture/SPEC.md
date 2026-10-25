# Recorded capture

Observer: the client compose gives one side to, which starts and stops it
for Session (`../session/SPEC.md`) and is told when the side fails. A
decorator at the root over one capture and its track
(`../../app-shape.md`). Hearing the side live is live audio's
(`../live-audio/SPEC.md`), over the capture it records.

## Decided

- **A decorator of its own, not compose's:** compose decides nothing
  (ARCHITECTURE rule 4) and both capture specs leave the file to others.
  It owns its interfaces for the capture and the track's writing.
- **Writing never holds the capture back:** pieces wait in memory for a
  slow track, without a bound, so live audio over the capture is never
  slowed (call text, Decided; LAB-551). Dropping audio would shift all
  later audio (track file, Decided), and the captures already buffer
  without a bound.
- **A failure is told when it happens, as the track's or the capture's,**
  so Session names the side while the other records (Session S-5, S-6).
  A failed write also stops the capture: capturing on would keep audio
  no track holds (track file S-10). A failed capture still has every
  piece it gave written.
- **Stopping returns once the last piece is written,** even when the
  capture's stop fails, so Session closes the track after its last audio.
  The stop a failed write makes fails at once, as the capture; only the
  stop I ask for fails at my stop, so each failure is told once.
- **A capture that does not start** writes nothing.

```gherkin
Feature: Recording a capture to its track

  Scenario: S-1 Captured audio is kept
    Given a recorded capture that is running
    When the capture gives audio
    Then I can read it back from the track

  Scenario: S-14 A slow track does not hold the capture back
    Given a recorded capture whose track is not writing
    When the capture gives audio
    Then I can tell the capture's audio was taken before it is written

  Scenario: S-4 Stopping keeps the last audio
    Given a recorded capture whose last audio is not yet written
    When I stop it
    Then I can read all of its audio from the track once the stop returns

  Scenario: S-6 A failed write ends the side
    Given a recorded capture that is running
    When writing to its track fails
    Then I can tell the track failed, before any stop
    And I can tell its capture was stopped
    And I can read every piece written before

  Scenario: S-7 A failed capture keeps what it gave
    Given a recorded capture that gave audio
    When the capture fails
    Then I can tell the capture failed, before any stop
    And I can read all the audio it gave from the track

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

  Scenario: S-10 A capture that does not start fails
    When the capture will not start
    Then I can tell the start failed, and that nothing was written
```

S-2, S-3, S-5, S-9 and S-12 moved to live audio (2026-10-25) and are not
reused here.
