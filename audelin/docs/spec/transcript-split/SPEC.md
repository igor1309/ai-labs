# Transcript split

Observer: the caller preparing the two transcripts.

```gherkin
Feature: Transcript split

  Scenario: S-1 Rebase the second part
    Given entries lie on both sides of the selected boundary
    When I split at the chosen time
    Then I can read each entry once with its time measured from its own part

  Scenario: S-2 Keep each part's speakers
    Given the parts use overlapping and distinct speakers
    When I split the transcript
    Then I can read each part with only its own speakers and their original names and identities

  Scenario: S-3 Locate the original recordings
    Given the call contains recordings before, across and after the cut
    When I split the transcript
    Then I can locate the recordings each part needs and where to cut a spanning recording
```
