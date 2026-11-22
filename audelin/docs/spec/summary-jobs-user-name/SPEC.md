# Summary jobs — the user's name in a run

Observer: the composition root, which answers SummaryJobs' generation
preferences port and receives its identify and make requests. The line is
`../summary-jobs/SPEC.md`; this spec adds one captured value. Oracle:
`../owner-name/SPEC.md` S-6, S-7 and `../../ARCHITECTURE.md` § The user's
name in notes.

## Decided

- **The name is read with the generation preferences when a run is
  prepared** and saved with the attempt, as the template and keep choice
  are (`../summary-jobs-templates/SPEC.md`), so recovery and later name
  changes behave the same way.
- **The name is carried, never interpreted:** no trimming, fallback or
  check here. No name is a value like any other.

```gherkin
Feature: The user's name in a run

  Scenario: S-1 The name reaches both requests
    Given the user's name is "Игорь" when a run is prepared
    When the run identifies speakers and makes notes
    Then I can observe both requests carrying "Игорь"

  Scenario: S-2 A later change does not reach a run
    Given a run was prepared with "Игорь"
    When the name becomes "Igor M" before its notes are made
    Then I can observe the notes request carrying "Игорь"

  Scenario: S-3 Recovery uses the saved name
    Given a run with "Игорь" was pending when the app exited
    When jobs are loaded
    Then I can resume it with "Игорь"

  Scenario: S-4 No name is carried as no name
    Given no user's name when a run is prepared
    When the run makes notes
    Then I can observe the notes request carrying no name

```
