# Previous transcript — the transcript a re-recognition replaced

Observer: the user, with a call whose transcript was made again
(`../re-recognition/SPEC.md`). Making notes again, from the template
menu, is `../notes-templates/SPEC.md`.
Oracle: the owner's rulings on LAB-1694.

## Decided

- **The transcript is read as a file, not in the calls window,** which
  shows no transcript (`../../design/calls-list.md`). The replaced one is
  a second file beside it in the call's folder, kept exactly, with the
  origin it had or none, so the user compares the two whole in any editor.
- **At most one previous transcript,** as notes keep one Previous: the
  exact text the user had before the last replacement. Another
  re-recognition drops the older one.
- **Restoring swaps the two in one step,** from the call's row menu, so
  neither is lost and no end, a crash included, leaves a mix. It needs
  Audelin idle and no merge or run under way (`../re-recognition-offer/SPEC.md`).
- **Notes are never made again by themselves:** that sends the transcript
  to a provider, the user's choice (`../call-summaries/SPEC.md`).
  Replacing or restoring starts no request.
- **Notes are marked by the transcript they were made from:** marked when
  it is not current, unmarked when it is current again. Notes made before
  this feature, whose transcript is unknown, are marked once the
  transcript is replaced, and stay marked after a restore until made
  again. Previous and Current notes each carry their own mark. Making
  notes again always reads the current transcript.

```gherkin
Feature: The transcript a re-recognition replaced

  Scenario: S-1 The replaced transcript is kept beside
    Given a call's transcript was made again
    When I open the call's folder
    Then I can open the current and the exact previous transcript, each with the origin it had

  Scenario: S-2 Restoring the previous transcript
    Given a call has a previous transcript
    When I restore it from the call's row menu
    Then I can open it as the call's transcript, the other as previous, and read the same notes

  Scenario: S-3 A failed restore
    Given a call has a previous transcript
    When restoring it fails
    Then I can read why, and open both transcripts as they were

  Scenario: S-4 Only one previous transcript is kept
    Given a call has a previous transcript
    When its transcript is made again
    Then I can open the new transcript and the one it replaced, and no older one

  Scenario: S-5 A call never made again
    Given a call's transcript was never made again
    When I open the call's row menu
    Then I see nothing to restore

  Scenario: S-6 Replacing keeps the notes
    Given a call has notes
    When its transcript is made again
    Then I can read the same notes, and no new notes are being made

  Scenario: S-7 Notes from a transcript not current say so
    Given a call's notes were made from a transcript that is not current
    When I read the notes
    Then I can see they were made from an earlier transcript

  Scenario: S-8 Notes from the current transcript say nothing
    Given a call's notes were made from the transcript that is current now
    When I read the notes
    Then I see no mark about an earlier transcript

  Scenario: S-10 Older notes after a restore
    Given a call's older notes were marked when its transcript was made again
    When I restore the previous transcript
    Then I can still see the notes marked

  Scenario: S-11 Each set of notes has its own mark
    Given a call's Previous notes were made from an earlier transcript and its Current notes from the current one
    When I switch between them
    Then I can see the mark on Previous only

  Scenario: S-9 Older notes after a replacement
    Given a call's notes were made before Audelin told notes' transcripts
    When its transcript is made again
    Then I can see the notes were made from an earlier transcript
```
