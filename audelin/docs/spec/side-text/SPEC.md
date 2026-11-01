# Side text

Observer: call text, which runs one per side (call-text S-1 to S-11).

Side text, a component of its own (LAB-554), reads one side's text
through a recording, through interfaces of its own: fill in catches live
text up, then it hears the live audio as it comes and ends with it. It
knows no side, device, file or model.

## Decided

- Fill in (`../fill-in/SPEC.md`) comes first, while live text gets ready
  and after a switch on; live audio is heard after it, from where it left.
- Its audio always ends from its source (live-audio S-4, S-10; compose
  ends an uncaptured side's as its track closes), so no time limit.
- Its text ends with its audio, after any filling in: no one stops it.
- Stopping reads the audio to its end; stopping while filling in abandons
  it. Abandoning ends at once, for a client that cannot wait.
- Switched off, the text stays as it is and live text is kept for a later
  switch on; any ending lets go of it, and ends only once that is done.
- Any failure, its own or fill in's, keeps the text so far and is told.

```gherkin
Feature: Reading one side's text through a recording

  Scenario: S-1 Audio is read as it comes
    Given live text on and ready, and nothing written yet
    When audio comes
    Then I can read its text while it comes

  Scenario: S-2 Live audio is read after filling in
    Given live text filling in while audio comes
    When filling in ends
    Then I can read the text from the call's start, then the live audio's

  Scenario: S-3 Switched off, the text stays as it is
    Given live text filling in, after some text
    When I switch it off, and audio goes on coming
    Then I can read the text so far, and no new text

  Scenario: S-4 Switched on, it fills in again
    Given live text switched off after some text, while audio comes
    When I switch it on
    Then I can read the text from the start once, the rest written later

  Scenario: S-5 Its text ends with its audio
    Given live text on and ready
    When the audio ends
    Then I can read all of its text, finished, and tell it ended

  Scenario: S-6 Audio ending while filling in finishes after it
    Given live text filling in
    When the audio ends, and then filling in ends
    Then I can read all of its text, finished, and tell it ended

  Scenario: S-7 Audio ending while off keeps the text so far
    Given live text switched off after some text
    When the audio ends
    Then I can tell it ended with the text so far

  Scenario: S-8 Stopping reads the audio to its end
    Given live text on and ready, with audio not yet read
    When I stop it, and the audio ends
    Then I can read the finished text of all that audio, and tell it ended

  Scenario: S-9 Stopping while filling in abandons it
    Given live text filling in
    When I stop it
    Then I can tell it ended with the text so far, before filling in ends

  Scenario: S-10 Abandoning ends it at once
    Given live text on and ready, its audio still coming
    When I abandon it
    Then I can tell it ended with the text so far, its audio still coming

  Scenario: S-11 Abandoning while filling in ends it at once
    Given live text filling in, its audio still coming
    When I abandon it
    Then I can tell it ended with the text so far, before filling in ends

  Scenario: S-12 Live text failing while hearing ends it
    Given live text on and ready
    When live text fails while hearing
    Then I can tell it failed, and read the text so far

  Scenario: S-15 Live text failing while finishing ends it
    Given live text on and ready
    When the audio ends, and live text fails while finishing
    Then I can tell it failed, and read the text so far

  Scenario: S-13 Filling in failing ends it
    Given live text filling in
    When filling in fails
    Then I can tell it failed, and read the text so far

  Scenario: S-14 Stopping twice ends once
    Given I am stopping it, with audio not yet read
    When I stop it again
    Then both stops end with the same finished text, ended once
```
