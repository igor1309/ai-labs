# Call reader

Observer: call events, which asks for the live call (`../call-events/SPEC.md`).
An adapter, the only part of the event source that knows the calls folder
and `transcript.md`; it reads them and writes nothing.

## Decided

- **It is given the calls folder,** the one Audelin's settings name; it does
  not read Audelin's settings.
- **Finding a call and reading it are apart:** the live call is the newest
  whose transcript tells how it was heard and no finishing stage
  (`../transcript-origin/`), an old one with no origin never; once found, that
  call is read until it ends, whatever newer call appears.
- **A call has ended only once its transcript tells a finishing stage.** The
  file alone cannot tell a quiet call from one cut off by a crash or
  recorded with no text, so those stay live until the user stops following.
- **Its start is the time its folder name begins with** (`../call-folder/`),
  kept through renames; the folder's dates change when it is copied.
- **It reads the transcript as `../transcript-format/` renders it:** each
  part's side, start in call time and words, gaps and names skipped. The
  format is a contract (ADR-003); its tests run on transcripts Audelin wrote.
- **The tail is read as the file shows it,** with no reconciling (ADR-003).

```gherkin
Feature: Reading the live call

  Scenario: S-1 With no call recording there is no live call
    Given the calls folder holds only finished calls
    When I ask for the live call
    Then I can read that there is none

  Scenario: S-2 The call being recorded is the live call
    Given a call is being recorded
    When I ask for the live call
    Then I can read what each side said, and when

  Scenario: S-3 Text added since is read
    Given I read the live call
    When more text is saved
    Then I can read the new text too

  Scenario: S-4 A finished call has ended
    Given I read the live call
    When it is finished
    Then I can read that it ended

  Scenario: S-5 A transcript that cannot be opened is said
    Given a call is being recorded
    When its transcript cannot be opened
    Then I can read that it could not be read

  Scenario: S-6 A transcript that cannot be understood is said
    Given a call is being recorded
    When its transcript is not as Audelin writes it
    Then I can read that it could not be read

  Scenario: S-7 The call found is read until it ends
    Given I read the live call
    When a newer call starts
    Then I can still read the first call, and then that it ended
```
