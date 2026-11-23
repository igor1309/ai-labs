# Notes generation — one validated notes attempt for a template

Observer: SummaryJobs, which asks through its own port for notes from a
final transcript, accepted speaker evidence and a resolved template.
Runtime execution is `../summary-runtime/SPEC.md`; fallback and logging are
root decorators (`../summary-jobs/SPEC.md` Decided). Oracle:
`../notes-templates/SPEC.md`, `../daily-notes/SPEC.md`,
`../call-summaries/SPEC.md`.

## Decided

- **Base faithfulness instructions are added to every template,** so a
  template edit cannot remove the ban on invented facts (call-summaries).
- **Headings to require come from the resolved template,** not from this
  adapter, so Default's sections and Daily's are template content only.
- **Structure is validated, truth is not:** required headings present once,
  in order, nonempty; optional headings allowed; anything else rejected, as
  today's Markdown rules (`../summary-jobs/SPEC.md` Decided).
- **It keeps nothing between attempts;** an invalid answer is a failure the
  root fallback may retry.

```gherkin
Feature: One validated notes attempt for a template

  Scenario: S-1 Notes with the template's headings
    Given a resolved template and a runtime answer with its headings
    When notes are asked for
    Then I can read the notes Markdown

  Scenario: S-2 The template's instructions reach the runtime
    Given a resolved template with edited instructions
    When notes are asked for
    Then I can rely on the runtime being asked with those instructions

  Scenario: S-3 Faithfulness is always asked for
    Given a template whose instructions omit faithfulness
    When notes are asked for
    Then I can rely on the runtime being asked with the base faithfulness rules

  Scenario: S-4 A missing required heading
    Given an answer without one of the template's required headings
    When notes are asked for
    Then I can read a validation failure naming that heading

  Scenario: S-5 An optional heading may be absent
    Given an answer with every required heading and no optional one
    When notes are asked for
    Then I can read the notes Markdown

  Scenario: S-6 An empty section
    Given an answer whose required section has no text
    When notes are asked for
    Then I can read a validation failure naming that section

  Scenario: S-7 Speaker names are used
    Given accepted speaker evidence
    When notes are asked for
    Then I can rely on the runtime being asked with those names

  Scenario: S-8 A runtime failure
    Given the runtime attempt fails
    When notes are asked for
    Then I can read that failure, with no notes

  Scenario: S-9 A repeated heading
    Given an answer that repeats a required heading
    When notes are asked for
    Then I can read a validation failure naming that heading

  Scenario: S-10 Headings out of order
    Given an answer whose required headings are out of the template's order
    When notes are asked for
    Then I can read a validation failure

  Scenario: S-11 An unexpected heading
    Given an answer with a top-level heading the template does not name
    When notes are asked for
    Then I can read a validation failure naming that heading

  Scenario: S-12 A preamble before the notes
    Given an answer with text before its first heading
    When notes are asked for
    Then I can read a validation failure

  Scenario: S-13 An optional heading present
    Given an answer with every required heading and an optional one
    When notes are asked for
    Then I can read the notes Markdown
```
