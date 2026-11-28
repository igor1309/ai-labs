# Track file split

Observer: the caller preparing audio for the parts.

```gherkin
Feature: Track file split

  Scenario: S-1 Cut a saved track
    Given a finished track spans the cut
    When I ask for the audio before and from the cut
    Then I can read each resulting track with its corresponding original audio

  Scenario: S-2 Report failed preparation
    Given a required track cannot be read
    When I ask to cut it
    Then I can identify the failed cut

  Scenario: S-3 Keep only available audio
    Given the call and microphone tracks have different extents
    When I ask for audio on both sides of the cut
    Then I can read the available samples in each part
```
