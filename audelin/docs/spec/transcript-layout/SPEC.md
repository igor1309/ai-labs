# Transcript layout

Observer: Reading, which hands it the displayed call's entries and gap
markers and reads back the ordered rows the panel shows. It keeps nothing
between calls; Reading holds the layout it returns.

## Decided

- Entries are ordered by their first reported start time. Each speaker's
  local id gets a unique display id; while present, later snapshots update
  its words without changing that identity or its original time and position.
  The words of entries before the last final one never change; their names
  and speaker places may. A listening update that
  omits an entry after it retires that entry's identity and time.
  If the producer reuses that local id, it gets a fresh, monotonically
  increasing display id and the newly reported start time. Equal start
  times keep first arrival order.
- Entry times are elapsed `MM:SS`, with minutes continuing past 59.
  Fractions are rounded down.
- Consecutive written-later entries form a group at their place in call
  order, spanning the earliest start through the latest end in that group.
- A gap sits among entries by its elapsed time and splits a written-later
  group. Repeated snapshots never duplicate or move a gap.

```gherkin
Feature: Laying out one call's transcript

  Scenario: S-1 Both speakers settle in call order
    Given both speakers have entries, including pending words
    When recognition firms up an entry
    Then Reading reads its words at the same identity and position
    And both speakers remain in call order

  Scenario: S-2 Recovered speech belongs where it was said
    Given text includes consecutive entries written later
    When the rows are laid out
    Then Reading reads those entries as one group with their elapsed span at their call position

  Scenario: S-3 A gap sits where the side went missing
    Given entries before and after a gap, including recovered speech
    When the rows are laid out
    Then Reading reads the gap between those entries, splitting the group

  Scenario: S-4 A reused speech slot belongs at its new time
    Given an entry is omitted from a listening snapshot
    When new speech arrives with the same speaker and local id
    Then Reading reads it with a fresh display id at its newly reported time
```
