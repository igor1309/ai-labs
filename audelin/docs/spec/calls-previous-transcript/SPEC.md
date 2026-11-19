# Calls — the previous transcript

Observer: compose, which answers Re-recognition's publish port and
Recordings' restore port with Calls (`../re-recognition/SPEC.md`,
`../recordings-transcript-again/SPEC.md`). It keeps
`../previous-transcript/SPEC.md`. Part of the Calls adapter, specified
here so each spec stays within 100 lines; finding a call by id, the Trash,
moves and merges hold as in `../calls/SPEC.md` and `../calls-merge/SPEC.md`.

## Decided

- **The previous transcript is a second file beside the current one** in
  the call's top-level folder, kept byte for byte. A merged call's parts
  are never touched.
- **A pair change is one step, as a merge is:** recorded before the first
  file moves; the new bytes are written beside, never over a file; a
  failure puts the pair back; an interrupted change is finished or put back
  when Calls starts, before its first listing. Calls runs one operation at
  a time, so a read through it during a change waits and finds a whole pair.
- **Publishing makes the old current previous,** deleting an older one;
  restoring swaps the two, and without a previous refuses, named.
- **A listing tells, per call, whether it has a previous transcript** and
  which tracks of which original call are missing, read as lengths are.
- **The current transcript's identity is a digest of its bytes,** read
  with the call's transcript for compose; Calls reads no format. Restoring
  brings back the same identity, so notes made from it are current again.

```gherkin
Feature: Keeping the previous transcript

  Scenario: S-1 Publishing keeps the old transcript beside
    Given a call with a transcript
    When a new transcript is published for it
    Then I read the new one as the call's transcript, and the old one, byte for byte, as its previous

  Scenario: S-2 Publishing drops an older previous
    Given a call with a previous transcript
    When a new transcript is published for it
    Then I read only the new one and the one it replaced

  Scenario: S-3 A failed publish leaves the pair
    Given a publish that fails after its first file moved
    When it ends
    Then I read the call's transcript and previous as they were, and I can tell why

  Scenario: S-4 An interrupted publish is settled at start
    Given a publish interrupted after its first file moved
    When Calls starts
    Then I read either the old pair or the new, whole

  Scenario: S-5 Restoring swaps the two
    Given a call with a previous transcript
    When I restore it
    Then I read the previous as the call's transcript, and the current one as its previous

  Scenario: S-6 A failed restore leaves the pair
    Given a restore that fails after its first file moved
    When it ends
    Then I read both as they were, and I can tell why

  Scenario: S-7 Restoring without a previous is refused
    Given a call with no previous transcript
    When I restore it
    Then nothing changes, and I can tell why

  Scenario: S-8 A listing tells the previous transcript
    Given a call with a previous transcript and one without
    When I list the calls
    Then I can tell which has one

  Scenario: S-9 A listing tells missing tracks
    Given a merged call with an original call missing its call track
    When I list the calls
    Then I can tell which original call misses which track

  Scenario: S-10 The transcript's identity follows its bytes
    Given a call whose transcript was replaced
    When I read its transcript
    Then I get a new identity if the bytes changed, the same one if not, and the same on every read

  Scenario: S-11 A merged call's parts are untouched
    Given a merged call
    When a new transcript is published for it
    Then every part's folder holds every file as it was

  Scenario: S-12 An interrupted restore is settled at start
    Given a restore interrupted after its first file moved
    When Calls starts
    Then I read either the old pair or the swapped pair, whole

  Scenario: S-13 Restoring brings back the identity
    Given a call's transcript was replaced
    When I restore the previous one
    Then I read the identity it had before the replacement

  Scenario: S-14 A read during a change finds a whole pair
    Given a publish half done
    When I read the call's transcripts
    Then I get them once the change ends, whole
```
