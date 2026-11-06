# Live panel presentation

Observer: the user reading the floating call panel.

## Decided

- Existing user scenario identities and wording move intact into this presentation responsibility so the root remains an overview below 100 lines; there is no change in behavior.
- Recording-problem copy, colours and gap-row presentation remain in the Glass Ledger design brief; existing tests continue to prove them.

```gherkin
Feature: Live panel presentation

  Scenario: S-4 Text settles in place
    Given a phrase is still being recognised
    When its recognition firms up
    Then the phrase changes where it stands, and the text I'm reading above it doesn't jump

  Scenario: S-5 A selection is held
    Given I've selected part of the transcript
    When new text arrives or the selected phrase settles differently
    Then I keep exactly the text I selected, and the panel shows it's held

  Scenario: S-6 The panel stays visible beside the call
    Given a call window is in front
    When I work in the call app
    Then I can still see the transcript panel over it

  Scenario: S-11 Held selections add up
    Given I hold a selection
    When I select another part of the transcript
    Then I hold both, and the panel shows each as held

  Scenario: S-12 A click keeps what is held
    Given I hold a selection
    When I click in the transcript
    Then I still hold it

  Scenario: S-13 Letting go of a held selection
    Given I hold several selections
    When I let one of them go
    Then I hold only the others

  Scenario: S-14 A held selection leaves the transcript
    Given I've selected part of the transcript
    When I finish selecting
    Then I hold it, and the selection fades from the transcript

  Scenario: S-16 The panel says live text is getting ready
    Given a call is being recorded and the speech models are still loading
    When I look at the panel
    Then I see that live text is getting ready and the call is already recorded
```
