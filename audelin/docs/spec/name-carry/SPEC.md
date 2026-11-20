# Name carry — old call-app names onto new speakers

Observer: Re-recognition, which asks it for each original call
(`../re-recognition/SPEC.md`). It keeps `../transcript-again/SPEC.md` S-4
and S-6. A pure rule over speaker times; it reads no words.

## Decided

- **A name moves only one-to-one:** an old named speaker and a new speaker
  each spend more than half of their own time overlapping the other.
  "Mostly each other" in the user spec, read strictly so that at most one
  pairing can hold for either side.
- **Anything else carries nothing,** as `../conversation-names/SPEC.md`
  prefers no name to a wrong one. No name is invented or merged.
- **The microphone side is never named here;** it is the user's.

```gherkin
Feature: Carrying old names onto new speakers

  Scenario: S-1 A mutual majority carries the name
    Given an old name and a new speaker that each spend most of their time on the other
    When names are carried
    Then that new speaker gets the name

  Scenario: S-2 An even split carries nothing
    Given an old name split evenly over two new speakers
    When names are carried
    Then neither new speaker gets it

  Scenario: S-3 An uneven split without a mutual majority carries nothing
    Given an old name mostly on one new speaker who is mostly someone else
    When names are carried
    Then that new speaker does not get it

  Scenario: S-4 Two names on one speaker carry nothing
    Given two old names that are each mostly on the same new speaker
    When names are carried
    Then that new speaker gets neither

  Scenario: S-5 No old names carry nothing
    Given an old transcript with no names
    When names are carried
    Then no new speaker gets a name
```
