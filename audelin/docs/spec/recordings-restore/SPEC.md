# Recordings — restoring the previous transcript

Observer: compose, which answers the restore port with Calls
(`../calls-previous-transcript/SPEC.md`). It keeps
`../previous-transcript/SPEC.md` S-2 and S-3; when a restore may start is
`../recordings-transcript-again-offer/SPEC.md`.

## Decided

- **A restore is an action, like a merge:** nothing else starts during it.
- **Restored lists again with the call selected** and publishes that the
  call's transcript changed; a failure lists nothing and names why.

```gherkin
Feature: Restoring the previous transcript

  Scenario: S-1 Restoring asks Calls
    Given a call offers a restore
    When I restore it
    Then the restore port is asked for that call, and I can tell a restore is under way

  Scenario: S-2 A restored call lists again
    Given a restore under way
    When the restore port reports restored
    Then no action is under way, the call is selected in a fresh listing, and I can tell its transcript changed

  Scenario: S-3 A failed restore is named
    Given a restore under way
    When the restore port reports why it failed
    Then no action is under way, the call is selected, and I can read why

  Scenario: S-4 Nothing starts during a restore
    Given a restore under way
    When I ask to rename, delete, merge, move or run
    Then nothing is asked of any port, and I can read why
```
