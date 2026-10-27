# Reading

Observer: compose, which feeds one recording's text, recording state and
reader actions into the reducer, and translates its state for the panel.
Reading owns no recording, recognition, window or other effects.

User scenarios covered: S-3, S-4, S-5, S-8, S-9, S-11, S-12, S-13, S-14,
S-15 and S-16.

## Decided

- Entries are ordered by their first reported start time. Each speaker's
  local id gets a unique display id; while present, later snapshots update
  its words without changing that identity or its original time and position.
  A listening snapshot that omits an entry retires its identity and time.
  If the producer reuses that local id, it gets a fresh, monotonically
  increasing display id and the newly reported start time. Held selections
  keep their original display ids and text. Equal start times keep first
  arrival order.
- Recording time is elapsed `HH:MM:SS`; entry times are elapsed `MM:SS`,
  with minutes continuing past 59. Fractions are rounded down.
- Consecutive written-later entries form a group at their place in call
  order, spanning the earliest start through the latest end in that group.
- Holds keep the supplied text exactly, oldest first. The same entry and
  text is one selection; different text in the same entry is another.
  Only letting that selection go removes it, even if its entry disappears.
- Scrolling away pauses following. Each previously unseen entry counts
  toward new-below, including recovered speech from earlier in the call.
  Revisions do not count; ids returning after a listening omission count
  as new entries. Reaching the bottom or
  jumping to live resumes following and clears the count.
- Text updates are complete snapshots while listening.
  Preparing, off, failed and finished updates retain prior entries absent from the
  update. Holds and following survive every status change.
- An inactive, unread recording shows an empty log. Recording with text
  off offers live text, keeping prior lines above it. Getting ready shows
  preparing. Listening, failure and completion show the available lines;
  recognition failure never changes the recording indicator.

```gherkin
Feature: Reading one recording

  Scenario: Both speakers settle in call order
    Given both speakers have entries, including pending words
    When recognition firms up an entry
    Then its words change at the same identity and position
    And both speakers remain in call order

  Scenario: Recovered speech belongs where it was said
    Given text includes consecutive entries written later
    When the log is read
    Then those entries form a group with their elapsed span at their call position

  Scenario: Held selections remain independent of recognition
    Given several selections have been held
    When text changes or disappears, or the reader scrolls or clicks
    Then every selection keeps exactly its supplied text in selection order
    And letting one go keeps every other selection

  Scenario: Scrolling away counts new entries
    Given the reader has scrolled away from the bottom
    When entries arrive or change
    Then only new identities increase new-below
    And reaching the bottom or jumping to live clears the count and follows again

  Scenario: A reused speech slot belongs at its new time
    Given pending speech is held and then omitted from a listening snapshot
    When new speech arrives with the same speaker and local id
    Then it has a fresh display id and appears at its newly reported time
    And it increases new-below if the reader is not following
    And the held selection keeps its original identity and exact text

  Scenario: Live text prepares while recording
    Given a recording is running
    When live text is getting ready
    Then the log shows preparing and recording shows its elapsed time

  Scenario: Switching off or failing preserves what was read
    Given the log has text
    When live text switches off, fails or finishes
    Then the text so far stays
    And the recording indicator changes only when recording reports a change
```
