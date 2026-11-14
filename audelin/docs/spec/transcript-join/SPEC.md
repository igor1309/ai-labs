# Transcript join

Observer: compose, which joins the transcripts of calls being merged and
hands the result to Transcript format to render (`../../../ARCHITECTURE.md`,
Merging calls), so the user can read them as one call (user merging calls,
`../merge-calls/SPEC.md`). A plain component and a transcript pipeline
operator: generic over the rows it carries, it reads only their times.

## Decided

- **A part is its start, its length and its rows,** each row's time counted
  from the part's start. Join reads nothing else of a row and passes it on
  unchanged.
- **The merged clock starts at the earliest part's start.** Each row moves by
  its part's start less the earliest start, so every row keeps its real
  time of day in the merged call.
- **Parts are ordered by start,** whatever order they are given in; rows
  keep their order within a part.
- **A gap sits between each two parts,** at the earlier part's end, with its
  length: the later start less the earlier part's end. Overlapping parts
  give a gap of no length rather than a failure; the user picks the parts.
- **No state and no ports.** The same parts always join the same way.

```gherkin
Feature: Joining calls' transcripts

  Scenario: S-1 Parts join in time order
    Given two parts, the later one given first
    When I join them
    Then I can read the earlier part's rows before the later part's

  Scenario: S-2 Rows keep their time of day
    Given two parts that started ten minutes apart
    When I join them
    Then I can read each row at its own part's offset from the earliest start

  Scenario: S-3 A gap says how long the call was cut off
    Given a part that ended two minutes before the next one started
    When I join them
    Then I can read a gap of two minutes between them, at the first part's end

  Scenario: S-4 Rows pass through unchanged
    Given parts whose rows carry speakers and words
    When I join them
    Then I can read every row with what it carried, in its part's order

  Scenario: S-5 Overlapping parts join with no gap
    Given a part that starts before the previous one ended
    When I join them
    Then I can read a gap of no length between them
```
