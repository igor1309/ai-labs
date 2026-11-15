# Daily notes — a handoff for the next meeting

Observer: the user, reading a call's notes made with the Daily template,
usually the morning after, to see what to pick up. Choosing the template is
`../notes-templates/SPEC.md`; faithfulness rules shared with all notes are
`../call-summaries/SPEC.md`. Oracle: the owner's rulings on LAB-1615.

## Decided

- **Actionable, not a recap.** No speaker-by-speaker account; who said what
  matters only as who owns what.
- **Gaps are said, never filled.** An unstated owner, date or fix reads as
  unclear; a topic not raised reads as not discussed, never as "none".

```gherkin
Feature: Daily notes as a handoff

  Scenario: S-1 Daily notes are a handoff
    Given a call's notes were made with Daily
    When I read them
    Then I can read what to continue, who does what, blockers, their planned fixes and planned meetings

  Scenario: S-2 Daily tells agreed from suggested
    Given a call has an agreed action and a suggestion
    When I read its Daily notes
    Then I can tell the agreed action from the suggestion

  Scenario: S-3 An unclear owner
    Given a call does not say who owns an action
    When I read its Daily notes
    Then I can read that the owner is unclear

  Scenario: S-4 An unclear fix
    Given a call names a blocker but not how it is resolved
    When I read its Daily notes
    Then I can read that the fix is unclear

  Scenario: S-5 Daily marks what was not discussed
    Given a call does not mention blockers
    When I read its Daily notes
    Then I can read that blockers were not discussed
```
