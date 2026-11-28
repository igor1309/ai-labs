# Split points

Observer: the caller choosing where to cut.

```gherkin
Feature: Split points

  Scenario: S-1 Rank boundaries
    Given a transcript has successive timed entries
    When I request split choices
    Then I can read the boundaries in descending order of time between starts, with the entries on both sides

  Scenario: S-2 Mark meeting transitions
    Given an entry contains a meeting ending or starting phrase
    When I request split choices
    Then I can tell which boundaries have a transition suggestion

  Scenario: S-3 Exclude empty parts
    Given a transcript has fewer than two eligible entries
    When I request split choices
    Then I can see that there is no cut to choose

  Scenario: S-4 Keep equal starts together
    Given timed entries share a start and the transcript contains a gap marker
    When I ask for choices
    Then I can choose only a boundary between distinct starts of spoken entries
```
