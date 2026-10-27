# Transcript writing

Observer: Session, which starts, switches and stops call text through
`SessionCallText` and must tell which piece failed (`../session/SPEC.md`).
A decorator compose puts around call text (ARCHITECTURE rule 5): it keeps
call text's text in the recording's transcript, as the data flow says
(`../../app-shape.md`), so the call is kept to its last word (user S-7,
S-17 in `../SPEC.md`). It owns the interfaces it writes and tells through.
What it keeps, Session has in the transcript it closes next.

## Decided

- **Starting, switching and stopping pass through to call text;** call
  text's updates, its failing included, are passed on as they come, not
  after a write, so a slow disk never delays the panel, and Session names
  call text's failure from them as call text's (call-text S-8). Call
  text's start, switch and stop never fail; it fails only in its updates,
  so stopping never fails either and is never cut short.
- **Updates are heard from before call text starts,** because it publishes
  while starting (session, Bring-up puts each destination before its source).
- **The write in flight finishes, then only the latest text waiting is
  written,** never an older one after a newer: each write replaces the
  whole text (`../transcript-file/SPEC.md`). The reading feed retains every
  snapshot, including listening omissions that retire entry identities.
- **Stopping returns once call text has stopped and its last text is
  written,** so Session closes the transcript after its last text
  (session, Bring-down keeps everything); a second stop waits for the
  first, as side text's does (side-text S-14).
- **A failed write is told as the transcript's, each time,** and ends
  nothing: the next text is written whole again (transcript-file S-9,
  S-10), so Session names it and keeps recording (session S-6). The last
  write failing is told before stopping returns, and stopping does not
  fail, since call text did stop.
- **Without a transcript, whose open failed, call text runs unchanged:**
  nothing is written or told, because Session already named the open
  (session S-6), and live text must not fail for the file's sake.

```gherkin
Feature: Keeping call text's text in the transcript

  Scenario: S-1 Call text's text is kept as it changes
    Given call text I started
    When its text changes
    Then the transcript I close keeps that text, and I can read it at once

  Scenario: S-2 Only the latest text is kept after a slow write
    Given a write of call text's text is held
    When its text changes twice, then the write returns
    Then the transcript I close keeps the latest, never the one between

  Scenario: S-3 Text while starting is kept
    Given call text whose text changes while it starts
    When it has started
    Then the transcript I close keeps that text

  Scenario: S-4 Switching off reaches call text
    Given call text I started with live text on
    When I switch live text off
    Then I can read that live text is off, and the transcript keeps its text

  Scenario: S-5 Switching on reaches call text
    Given call text I started with live text off
    When I switch live text on
    Then I can read that live text is on, and the transcript keeps its text

  Scenario: S-6 Stopping returns after the last text is kept
    Given call text I started
    When I stop it, and both its stop and its last write are held
    Then my stop returns only once both have returned

  Scenario: S-7 A failed write is told as the transcript's
    Given call text I started
    When writes of its text fail
    Then I am told each, as the transcript's, and call text goes on

  Scenario: S-8 A write after a failed one keeps the newer text
    Given call text whose last write failed
    When its text changes
    Then the transcript I close keeps the new text

  Scenario: S-9 The last write failing still lets stopping return
    Given call text I started whose last write will fail
    When I stop it
    Then I am told the transcript failed, and then my stop returns

  Scenario: S-10 Call text failing is passed on as call text's
    Given call text I started, with a write held
    When call text fails, and the held write fails too
    Then I can read call text failed, am told the transcript did, and the last text is kept

  Scenario: S-11 Call text runs without a transcript
    Given no transcript, as its open failed
    When I start, switch and stop call text
    Then I can read call text, my stop returns, and I am told nothing

  Scenario: S-12 Stopping twice
    Given a stop of call text I started is waiting for its last write
    When I stop it again
    Then my second stop returns only once the first does
```
