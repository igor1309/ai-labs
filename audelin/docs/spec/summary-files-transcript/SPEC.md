# Summary files — the transcript notes were made from

Observer: SummaryJobs, which commits an attempt, and CallDetail, which reads
a call's notes, each through ports it owns, as in
`../summary-files-versions/SPEC.md`. It keeps the identities that
`../call-detail-transcript-mark/SPEC.md` marks by.

## Decided

- **Each set of notes keeps the identity of the transcript it was made
  from,** saved with the template's, as compose passed it when it submitted
  the transcript. SummaryJobs relays it with the transcript it submitted,
  a resumed run included, and reads nothing of it.
- **Notes without an identity read as unknown,** without rewriting the call.
- **Each version keeps its own,** so Previous and Current are told apart.

```gherkin
Feature: The transcript notes were made from

  Scenario: S-1 The identity is read back
    Given notes were published with a transcript's identity
    When they are read
    Then I get that identity

  Scenario: S-2 Older notes read as unknown
    Given notes were published before identities were saved
    When they are read
    Then I get an unknown identity

  Scenario: S-3 Each version keeps its own
    Given Previous notes made from one transcript and Current from another
    When they are read
    Then I get each version's own identity

  Scenario: S-4 A failed publication keeps the identities
    Given Previous and Current notes with their identities
    When publishing fails
    Then I read the same identities on the same notes
```
