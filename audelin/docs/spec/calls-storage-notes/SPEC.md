# Calls storage — notes publication beside folder changes

Observer: SummaryFiles, which publishes notes inside a storage transaction,
and the composer, which tells SummaryJobs when one runs. The rest is
`../calls/SPEC.md` and `../recordings/SPEC.md`; merged notes follow
`../summary-composition/SPEC.md` S-15.

## Decided

- **Transactions exclude publication from rename, deletion, merge and
  folder moves;** what is published is not interpreted here.

```gherkin
Feature: Notes publication beside folder changes

  Scenario: S-1 Publication waits for a rename
    Given a rename transaction is running
    When notes are published for that call
    Then I can read the notes in the renamed folder

  Scenario: S-2 A transaction's running is observable
    Given a client observes transactions
    When a move starts and ends
    Then I can observe it running and then not

  Scenario: S-3 Both versions move with the call
    Given a call has Previous and Current
    When its folder is moved
    Then I can read both versions in the moved folder

  Scenario: S-4 A merged call starts without its parts' notes
    Given parts with notes are merged into one call
    When the merged call's notes are read
    Then I can read that it has none until its own are made
```
