# Summary jobs replacement

Observer: the caller reporting a call replacement.

```gherkin
Feature: Summary jobs replacement

  Scenario: S-1 Replace notes jobs
    Given a replacement has committed with eligible pending notes jobs
    When I publish the replacement
    Then I can read notes from each replacement transcript under its own call

  Scenario: S-2 Reuse assigned names
    Given a pending job already has the saved speaker names
    When the job runs live or after recovery
    Then I can read notes generated using those names

  Scenario: S-3 Honor notes admission
    Given notes are disabled or a part has no usable transcript
    When I prepare replacement jobs
    Then I can see that no pending job is needed for that part
```
