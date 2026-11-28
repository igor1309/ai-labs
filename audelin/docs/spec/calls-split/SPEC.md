# Calls split

Observer: the caller replacing a call folder.

The final folder names must be accepted by the destination filesystem
before the original moves. A rejected name returns an invalid-title error
and leaves the original readable.

```gherkin
Feature: Calls split

  Scenario: S-1 Publish both parts
    Given both parts have been prepared
    When I publish the split
    Then I can list both parts in place of the original and read their prepared contents

  Scenario: S-2 Fail before commit
    Given preparation or publishing fails before the commit decision
    When I try to split the call
    Then I can still read the original call as it was

  Scenario: S-3 Recover before commit
    Given an interruption left an uncommitted split
    When I reopen the calls folder
    Then I can list and read the original call

  Scenario: S-4 Recover after commit
    Given an interruption left one part published after commit
    When I reopen the calls folder
    Then I can list and read both complete parts

  Scenario: S-5 Restore relocated recordings
    Given the split was interrupted before commitment after relocating source recordings
    When I reopen the calls folder
    Then I can read the original with all of its recordings in place
```
