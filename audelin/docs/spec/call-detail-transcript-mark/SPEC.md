# Call detail — marking notes from an earlier transcript

Observer: the calls window, which draws CallDetail's state. It keeps
`../previous-transcript/SPEC.md` S-5 to S-11. The read of a call's notes
is `../summary-files-transcript/SPEC.md`; the current transcript's
identity and whether a previous exists come with the read, from
`../calls-previous-transcript/SPEC.md` through compose.

## Decided

- **A pure rule marks each set of notes:** marked when its identity is
  known and is not the current transcript's, or when it is unknown and the
  call has a previous transcript. Otherwise unmarked.
- **The mark is part of the state of each shown version,** so switching
  between Previous and Current shows each one's own.
- **The mark text is an injected formatter;** the view renders it only.
- **A transcript change is read again.** Compose tells CallDetail when the
  shown call's transcript was made again or restored, as it tells it when
  notes may have changed, and CallDetail reads the call again.

```gherkin
Feature: Marking notes made from an earlier transcript

  Scenario: S-1 Notes from the current transcript are unmarked
    Given a read whose notes' identity is the current transcript's
    When it arrives
    Then I see no mark

  Scenario: S-2 Notes from another transcript are marked
    Given a read whose notes' identity is known and not the current transcript's
    When it arrives
    Then I see the mark, with the formatter's text

  Scenario: S-3 Unknown notes are unmarked without a previous
    Given a read whose notes' identity is unknown and no previous transcript
    When it arrives
    Then I see no mark

  Scenario: S-4 Unknown notes are marked with a previous
    Given a read whose notes' identity is unknown and a previous transcript
    When it arrives
    Then I see the mark

  Scenario: S-5 Each version has its own mark
    Given Previous notes marked and Current notes unmarked
    When I switch between them
    Then I see the mark on Previous only

  Scenario: S-6 A transcript change reads the call again
    Given a call is shown
    When compose says its transcript changed
    Then its notes are read again, and I see the mark the new read gives
```
