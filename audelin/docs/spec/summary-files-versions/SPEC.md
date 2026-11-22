# Summary files — Previous and Current notes

Observer: SummaryJobs, which commits an attempt, and CallDetail, which reads
a call's notes, each through ports it owns. Job records and first-notes
publication are `../summary-files/SPEC.md`. Oracle:
`../notes-templates/SPEC.md` S-5 to S-7, S-9, S-10, S-14 and
`../../ARCHITECTURE.md` § Published notes and the keep choice.

## Decided

- **Previous and Current are published together with the attempt,** so no
  reader sees a pair half-written.
- **Each version keeps the template's identity and name saved at making,**
  so editing or removing the file later does not change attribution.
- **Notes without template metadata read as Current made with Default,**
  without rewriting the call (notes-templates Decided).
- **The rotation or replacement is the caller's;** this adapter reads no
  preferences.

```gherkin
Feature: Previous and Current notes

  Scenario: S-1 Rotation keeps the old Current
    Given a call has Previous and Current
    When an attempt is published with rotation
    Then I can read the old Current as Previous and the new as Current

  Scenario: S-2 Rotation of a first pair
    Given a call has only Current
    When an attempt is published with rotation
    Then I can read the old Current as Previous and the new as Current

  Scenario: S-3 Replacement keeps only the new notes
    Given a call has Previous and Current
    When an attempt is published with replacement
    Then I can read only the new Current

  Scenario: S-4 Attribution is read back
    Given notes were published made with Daily
    When they are read
    Then I can read Daily's name and the date they were made

  Scenario: S-5 Attribution survives the template file
    Given the template file that made the notes was removed
    When they are read
    Then I can read that template's saved name

  Scenario: S-6 Older notes read as Default
    Given a call's notes have no template metadata
    When they are read
    Then I can read them as Current made with Default

  Scenario: S-7 A failed publication keeps the pair
    Given a call has Previous and Current
    When publishing fails
    Then I can read the same Previous and Current

  Scenario: S-9 A reader during publication
    Given a publication with rotation is under way
    When the call's notes are read
    Then I can read either the whole old pair or the whole new pair

  Scenario: S-10 Recovery after an interrupted publication
    Given the app exited during a publication
    When the call's notes are read
    Then I can read a whole pair that agrees with the attempt's outcome

  Scenario: S-8 A discarded attempt keeps the pair
    Given a call has Previous and Current
    When its attempt is discarded
    Then I can read the same Previous and Current
```
