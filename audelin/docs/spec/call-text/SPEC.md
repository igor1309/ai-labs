# Call text

Observer: the client that shows a recorded call's text, both sides, and
switches live text, through an interface it owns: the panel's transcript
model, through the feed adapter at the root (no spec yet; it is next). It
needs this to keep user spec S-3 (S-1, S-2), S-8 (S-6), S-15 (S-5) and S-16
(S-4); S-9 is this S-8 with session keeping the call.

Call text is a Core. It reads the call's written tracks and runs one live
text per track, through interfaces of its own. It knows no device, file or
model, and records nothing (session).

## Decided

- It reads only written audio, so the text never outruns what is kept
  (mvp.md rule 1).
- The mic track's text is mine and the call track's is theirs (mvp.md
  rule 2; live text leaves whose track it is to its client).
- Reading never waits for the models and never makes the recording wait:
  until they are in, the client can tell live text is getting ready, then
  it reads from the call's start (mvp.md, owner 2026-10-22; user spec S-15,
  S-16). Both models hear audio at about 4% of real time (run 8).
- Switched on mid-call, it reads the call from its start and marks that
  text as written later; switched off, it keeps the text so far (mvp.md,
  Controls).
- Live text failing ends the text, not the call (user spec S-9).

```gherkin
Feature: Reading a call's text as it is recorded

  Scenario: S-1 What I say is read as mine as I say it
    Given a recorded call with live text on
    When I speak
    Then I can read what I say while I am saying it, marked as mine

  Scenario: S-2 What they say is read as theirs as they say it
    Given a recorded call with live text on
    When the other side speaks
    Then I can read what they say while they are saying it, marked as theirs

  Scenario: S-3 Nothing is read before it is recorded
    Given audio that is not yet written
    When it is spoken
    Then I cannot read its text until it is written

  Scenario: S-4 Live text says it is getting ready
    Given the models are still loading
    When a recorded call starts
    Then I can tell live text is getting ready

  Scenario: S-5 Live text catches up from the start
    Given a call recorded while the models were loading
    When they finish loading
    Then I can read what was said from the call's start

  Scenario: S-6 Live text switched off keeps the text so far
    Given a recorded call with live text on
    When I switch live text off
    Then I can read the text so far and no new text

  Scenario: S-7 Live text switched on fills in the call
    Given a recorded call with live text off
    When I switch live text on
    Then I can read the call from its start, marked as written later

  Scenario: S-8 Failing live text is told
    Given a recorded call with live text on
    When live text fails
    Then I can tell live text failed
```

Not call text's: recording (session), cutting text into segments (live
text), keeping the call recorded when text fails (session), and the panel.
