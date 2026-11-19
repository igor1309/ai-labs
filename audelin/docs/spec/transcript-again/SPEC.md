# Re-recognition — making a call's transcript again from its audio

Observer: the user, who wants a kept call's transcript made again by this
Audelin. Its origin is `../transcript-origin/SPEC.md`; the transcript
replaced, and its notes, `../previous-transcript/SPEC.md`.
Oracle: the owner's rulings on LAB-1694.

## Decided

- **A recording that starts stops the run:** a call to record outranks one
  kept. What else cannot run beside it is `../transcript-again-offer/SPEC.md`'s.
- **The new transcript is finished as a recorded call's is**
  (`../transcript-finalization/SPEC.md`): both sides heard, cleaned,
  split, told as `../transcript-origin/SPEC.md` tells them, its origin
  this Audelin's. Cleaning or splitting that keeps nothing still finishes;
  a side that cannot be heard, or a save that fails, fails the run.
- **Names the call app showed cannot be read again,** so a name the old
  transcript carries moves only when it and one new speaker overlap mostly
  each other; any other match stays unnamed, as
  `../conversation-names/SPEC.md` prefers no name to a wrong one.
- **The transcript and its previous one change in one step** once the new
  one is saved: after any end, a crash included, the old pair or the new.
- **Waits: preparing, hearing, finishing;** cancel or quit before the
  swap keeps the old pair, and once it began, waits for the new one.
- **A merged call is made again by its original calls,** merges of merges
  included, and joined as merging joins them; one failing fails the run.

```gherkin
Feature: Making a call's transcript again from its audio

  Scenario: S-1 Preparing
    Given I asked to make a call's transcript again while the speech models load
    When I look at the call
    Then I can see it is preparing, and I can cancel

  Scenario: S-2 Hearing
    Given a call's audio is being heard again
    When I look at the call
    Then I can see how far it has got, cancel, and open the transcript the call had

  Scenario: S-3 Finishing
    Given a call's audio was heard again and is being cleaned, split and saved
    When I look at the call
    Then I can see it is finishing, cancel, and open the transcript the call had

  Scenario: S-4 The new transcript replaces the old
    Given a call's transcript is being made again
    When the new one is saved
    Then I can open a transcript heard by this Audelin, cleaned, split and named as a new call's is

  Scenario: S-5 Finishing that keeps nothing
    Given a call's new transcript has nothing kept by cleaning
    When the new one is saved
    Then I can read the words as heard, and see that cleaning kept nothing

  Scenario: S-6 An ambiguous name stays unnamed
    Given a call-app name in the old transcript matches no one new speaker alone
    When the new transcript is saved
    Then I can read the speakers it overlaps unnamed

  Scenario: S-7 Cancelling keeps the transcript
    Given a call's transcript is being made again
    When I cancel
    Then I can open the transcripts the call had, and I see no error

  Scenario: S-8 Hearing fails
    Given a call's transcript is being made again
    When a side cannot be heard
    Then I can read why, open the transcripts the call had, and try again

  Scenario: S-9 Saving fails
    Given a call's new transcript is being saved
    When saving fails
    Then I can read why, open the transcripts the call had, and try again

  Scenario: S-10 Quitting keeps the transcript
    Given a call's transcript is being made again
    When I quit Audelin and open it again
    Then I can open the transcripts the call had, and nothing is being made

  Scenario: S-11 A recording starting stops it
    Given a call's transcript is being made again
    When a recording starts
    Then before saving began I can open the old call's transcripts as they were, and read that making it again stopped

  Scenario: S-12 A merged call is made again by its original calls
    Given a merged call whose original calls all have their audio
    When its new transcript is saved
    Then I can open one transcript with each original call heard again, in order, each cut-off marked

  Scenario: S-13 A failed original call keeps the merged transcript
    Given a merged call's transcript is being made again
    When one original call cannot be heard
    Then I can open the merged transcripts as they were, read which call failed and why, and try again

  Scenario: S-14 The speech models fail to load
    Given I asked to make a call's transcript again
    When the speech models cannot be loaded
    Then I can read why, open the transcripts the call had, and try again
```
