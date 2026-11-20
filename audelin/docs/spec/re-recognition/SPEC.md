# Re-recognition — one transcript from a call's tracks

Observer: compose, which answers Recordings' run port with it
(`../recordings-transcript-again/SPEC.md`). It keeps
`../transcript-again/SPEC.md`. A plain component: nothing kept.

## Decided

- **The order is fixed:** hear both tracks of every original call; then,
  for each, split the far side and clean the microphone side; then carry names,
  join the original calls, and publish. An unmerged call is one original.
- **Hearing reports how far** over all tracks of all original calls, so
  one fraction runs once from start to end. Preparing comes before the
  first heard audio; finishing from the split to the publish's end.
- **Split and clean keep nothing without failing,** as a live call's
  finishing does: the far side stays one speaker, the microphone side as
  heard, and each outcome goes into the origin. A track that cannot be
  heard, including the models failing to load, or a failed publish fails
  the run, naming the original call where there is one. An old transcript
  that cannot be read carries no names; its audio is still the call's.
- **Names are carried by Name carry** (`../name-carry/SPEC.md`), old
  speakers read from the current transcript only, cut by each original call's span.
- **Publishing is one call and the commit point.** Stopped before it, the
  run publishes nothing and reports stopped once the port in flight
  returns; during it, it reports the publish's outcome. Keeping the old
  transcript as previous is the publish port's answer.

```gherkin
Feature: Making one transcript from a call's tracks

  Scenario: S-1 A call is made in order
    Given a call's two tracks can be heard, split and cleaned
    When I run it
    Then the publish port gets one transcript with both sides heard, the far side split and the microphone side cleaned

  Scenario: S-2 Preparing is reported first
    Given the hear port is loading
    When I run a call
    Then preparing is reported before any fraction

  Scenario: S-3 One fraction over every track
    Given a merged call of two original calls
    When I run it
    Then the fractions reported only rise, from the first track to the last

  Scenario: S-4 A split that keeps nothing still publishes
    Given splitting the far side keeps nothing
    When I run a call
    Then the published transcript has the far side as one speaker, and says the split kept nothing

  Scenario: S-5 A clean that keeps nothing still publishes
    Given cleaning the microphone side keeps nothing
    When I run a call
    Then the published transcript has the microphone side as heard, and says cleaning kept nothing

  Scenario: S-6 Carried names are published
    Given Name carry gives a new speaker an old name
    When I run the call
    Then the published speaker carries that name

  Scenario: S-7 A track that cannot be heard fails
    Given one track cannot be heard
    When I run a call
    Then nothing is published, and the run fails saying why

  Scenario: S-8 A merged call names the failing call
    Given one original call of a merged call cannot be heard
    When I run it
    Then nothing is published, and the run fails naming that original call

  Scenario: S-9 Original calls are joined
    Given a merged call of two original calls
    When I run it
    Then the published transcript holds both, each heard anew, joined as merging joins them

  Scenario: S-10 Stopping publishes nothing
    Given a run is hearing
    When it is asked to stop
    Then nothing is published, and it reports stopped once hearing returns

  Scenario: S-11 A failed publish fails
    Given the publish port fails
    When I run a call
    Then the run fails saying why

  Scenario: S-12 The models fail to load
    Given the hear port fails while loading
    When I run a call
    Then nothing is published, and the run fails saying why

  Scenario: S-13 A stop during publishing reports made
    Given a run is publishing
    When it is asked to stop and the publish succeeds
    Then it reports made

  Scenario: S-14 No old transcript carries no names
    Given a call whose old transcript cannot be read
    When I run it
    Then the publish port gets a transcript with no names carried
```
