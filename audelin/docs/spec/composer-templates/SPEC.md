# Composer — wiring notes templates

Observer: the app, which builds the composer once and holds what it
returns until quit. Recording and summary wiring are
`../summary-composition/SPEC.md`. Oracle: `../notes-templates/SPEC.md`.

## Decided

- **TemplateFiles, NotesGeneration, SummaryFiles, Preferences and
  SummaryJobs are built once for the app's life;** CallDetail and NotesMenu
  once per detail presentation. Nothing is built per job.
- **The composer maps and subscribes only;** it decides no template,
  rotation or menu content (architecture rule 4).

```gherkin
Feature: Wiring notes templates

  Scenario: S-1 A chosen template reaches the jobs
    Given a call is shown
    When its menu publishes an intention with Daily
    Then I can observe SummaryJobs making that call's notes with Daily

  Scenario: S-2 Progress reaches the detail
    Given a call's notes are being made
    When SummaryJobs publishes progress
    Then I can observe the shown detail drawing it

  Scenario: S-3 A publication reaches the detail
    Given a call is shown
    When SummaryJobs publishes its notes
    Then I can observe the detail reading the new pair

  Scenario: S-4 The keep choice is shared
    Given the menu saves keeping off
    When SummaryJobs prepares a run
    Then I can observe it capturing keeping off

  Scenario: S-7 Another detail sees the keep change
    Given two details are presented
    When one's menu saves keeping off
    Then I can observe the other drawing keeping off

  Scenario: S-8 A cancel reaches the jobs
    Given a call's notes are being made again
    When its detail publishes a cancel intention
    Then I can observe SummaryJobs ending that run with the notes kept

  Scenario: S-9 The menu follows the shown call
    Given a call's notes start being made
    When the menu is opened
    Then I can observe every template disabled in that menu

  Scenario: S-5 Search reads Current
    Given a call has Previous and Current
    When calls are searched
    Then I can find the call by its Current notes once

  Scenario: S-6 Work survives another selection
    Given a call's notes are being made
    When another call is selected
    Then I can observe the run still going
```
