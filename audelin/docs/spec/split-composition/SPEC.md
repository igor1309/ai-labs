# Split composition

Observer: Recordings using the split ports.

```gherkin
Feature: Split composition

  Scenario: S-1 Prepare both parts on the cut clock
    Given a call with tags, named speakers and audio can be split
    When I confirm a boundary and both titles
    Then I can open each part with its own transcript, speakers, audio and tags

  Scenario: S-2 Merge the split parts back
    Given both parts of a split are available
    When I merge them
    Then I can read the restored sequence at its original times

  Scenario: S-3 Recover notes after a split
    Given a committed split has pending notes jobs
    When I reopen Audelin
    Then I can read new notes for both parts

  Scenario: S-4 Keep the clock across an audio gap
    Given a merged recording has a cut at an existing audio gap boundary
    When I split the call and merge the parts again
    Then I can read the original row times and locate their audio

  Scenario: S-5 Keep the cut visible after merging
    Given the parts share an audio boundary
    When I merge the parts
    Then I can see a marker at the cut
```
