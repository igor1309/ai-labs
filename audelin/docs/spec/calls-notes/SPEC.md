# Calls — calls without reading notes

Observer: the composer, which lists calls and searches them alongside the
notes SummaryFiles reads. The rest of Calls is `../calls/SPEC.md`, whose S-12 no longer reads notes.

## Decided

- **Calls reads no notes files,** so the notes format has one reader
  (architecture rule 2).

```gherkin
Feature: Calls without reading notes

  Scenario: S-1 A call with two notes versions is one call
    Given a call folder holds Previous and Current notes
    When calls are listed
    Then I can list it once

  Scenario: S-2 A call's transcript without its notes
    Given a call folder holds notes
    When its transcript is read
    Then I can read the transcript unchanged by the notes
```
