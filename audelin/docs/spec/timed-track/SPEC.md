# Timed track

Observer: the client that reads one track of a call as continuous audio in
call time, through an interface it owns. Timed track is a Core: it reads
audio pieces stamped with their source's time through an interface of its
own, and knows nothing of where they come from.

## Decided

- Track time is call time, an Audelin decision: a call's two tracks are
  lined up by time (mvp.md: two tracks, one stereo file), and live text
  times each word in its track. The track starts when its source starts,
  and each piece's time counts from that start.
- A stretch the pieces skip is filled with silence, placed by the pieces'
  own times, because only the source's clock knows the gap: a tap delivers
  nothing while nothing plays (Muesli), and Amanu, which offsets a track by
  its first buffer, keeps no gaps.
- A change of rate keeps time: what came before stays where it was.
- An ending or a failure of the pieces ends the track the same way.

```gherkin
Feature: One track in call time

  Scenario: S-1 Pieces in order are read as they came
    Given pieces that follow each other without a gap
    When I read the track
    Then I can read them in order, unchanged

  Scenario: S-2 Sound keeps its time after a quiet start
    Given the first piece comes some time after the start
    When I read the track
    Then I can read silence until that piece

  Scenario: S-3 Sound keeps its time after a quiet stretch
    Given pieces with a gap between them
    When I read the track
    Then I can read silence for the gap

  Scenario: S-4 A new rate keeps the time
    Given pieces whose rate changes
    When I read the track
    Then I can read each piece where it falls in call time

  Scenario: S-5 The end of the pieces ends the track
    Given the pieces end
    When I read the track
    Then I can read the end of the track

  Scenario: S-6 A failure of the pieces is told
    Given the pieces fail
    When I read the track
    Then I can tell the track failed
```

S-2 and S-3 were system audio capture's S-3 and S-4. Not timed track's:
the pieces (system audio capture), converting for recognition, and lining
two tracks up (the client).
