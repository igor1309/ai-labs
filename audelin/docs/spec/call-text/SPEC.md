# Call text

Observer: the client that shows a recorded call's text, both sides, and
switches live text, through an interface it owns: the panel's transcript
model, through the feed adapter at the root (no spec yet). It needs this
to keep user spec S-3 (S-1, S-2), S-8 (S-6), S-9 (S-8), S-15 (S-5) and
S-16 (S-4).

Call text takes each track's audio as it comes and runs one live text per
track, through interfaces of its own; it reads the call's written tracks
only to fill in what live text did not hear. It knows no device, file or
model, and records nothing. The live text preview's `LiveCall` already does
this for a file or the microphone; call text is that without the preview's
window.

## Decided

- Each side is a side text (`../side-text/SPEC.md`), which reads that
  side's audio as it comes and its written track only to fill in; call
  text marks whose it is, switches both, and shows their status as one.
- Live text never waits for the files: reading files would put the disk
  between the speaker and the text for no gain (owner, 2026-10-22).
- The mic track's text is mine and the call track's is theirs: live text
  leaves whose track it is to its client.
- Reading never waits for the models: until they are in, the client can
  tell live text is getting ready, then it reads from the call's start
  (user spec S-15, S-16). Both models hear audio at about 4% of real time
  (run 8).
- Switched on mid-call, it reads the call from its start and marks that
  text as written later (the design's Added late group,
  `HIqfu`, Screen 3);
  switched off, it keeps the text so far (user spec S-8).
- Live text failing is told and ends call text: the other side is
  abandoned, not stopped, since its audio may go on. The recording is not
  call text's (user spec S-9).
- Call text ends once both sides have ended and let go of their live
  text: each ends with its audio, and stopping stops both (LAB-554).

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

  Scenario: S-9 Live text does not wait for the files
    Given a recorded call with live text on, and its audio not yet written
    When I speak
    Then I can read what I say while I am saying it

  Scenario: S-10 One side ending leaves the other reading
    Given a recorded call with live text on
    When my side's audio ends
    Then I can read all of my text, and what they say goes on coming

  Scenario: S-11 Stopping ends with both sides' text
    Given a call with live text on and ready, its captures stopped
    When I stop call text
    Then I can read both sides' text to its end, and tell it ended
```

S-3 ("Nothing is read before it is recorded") is retired: live text reads
the audio as it comes, not the files.

Not call text's: recording and keeping the call when text fails (the
capture adapters and their file decorators), cutting text into segments
(live text), and the panel.
