# Recording conditions: a moving calls folder

Observer: compose, which sends RecordingConditions its readings, call-audio
access and whether a folder move holds the calls folder, and passes each
published condition on to Recording. This spec covers the calls folder
while a move holds it; the other conditions are described in the
architecture.

## Decided

- **A moving folder is its own reason.** While a move holds the calls
  folder, the folder is published as moving, not as lost, so Recording can
  hold a start for the move instead of refusing it. A change between moving
  and lost is published although the folder is unavailable either way.
- **The folder is read again before the move's news ends.** When the move
  lets the folder go, the folder stays moving until the reading asked for
  at that moment arrives; that reading decides available or lost. Any other
  reading, such as one already on its way, cannot end it, so the old
  folder's last reading is never taken for the new one.
- **A new move supersedes a pending reading.** A move that takes the folder
  before the last move's reading arrives keeps it moving; only the reading
  asked for when the latest move lets go ends it.

```gherkin
Feature: The calls folder while a move holds it

  Scenario: S-1 A move makes the folder moving
    Given the calls folder is available
    When a move takes the calls folder
    Then I can read that the calls folder is moving

  Scenario: S-2 A lost folder that starts moving is published again
    Given the calls folder is lost
    When a move takes the calls folder
    Then I can read that the calls folder is moving

  Scenario: S-3 The end of a move waits for a fresh reading
    Given the calls folder is moving
    When the move lets it go
    Then I can read that the calls folder is still moving and see it read again

  Scenario: S-4 A fresh reading ends the move
    Given a move let the calls folder go and a reading was asked for
    When that reading arrives with the folder there
    Then I can read that the calls folder is available

  Scenario: S-5 A fresh reading can find the folder lost
    Given a move let the calls folder go and a reading was asked for
    When that reading arrives without the folder
    Then I can read that the calls folder is lost

  Scenario: S-6 Another reading does not end the move
    Given a move let the calls folder go and a reading was asked for
    When a reading other than that one arrives
    Then I can read that the calls folder is still moving

  Scenario: S-7 An earlier move's reading does not end a later move
    Given a move let the calls folder go and a second move took it
    When the first move's reading arrives
    Then I can read that the calls folder is still moving

  Scenario: S-8 Only the latest move's reading ends moving
    Given the second move let the calls folder go and a reading was asked for
    When the first move's reading and then the second's arrive
    Then I can read moving after the first and available after the second
```
