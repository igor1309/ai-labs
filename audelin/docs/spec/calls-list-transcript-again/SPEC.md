# Calls list — making a transcript again

Observer: the user, at a call's row and its menu. The state it draws is
Recordings' (`../recordings-transcript-again/SPEC.md`); it keeps
`../transcript-again-offer/SPEC.md` and the waits in
`../transcript-again/SPEC.md`. A UI module: it renders state and sends what
the user does, nothing else; its cases are previews.

## Decided

- **The menu holds «Распознать заново» after Переименовать,** and
  «Вернуть прежний транскрипт» after it when the call has a previous one,
  disabled while it cannot start. A disabled item shows its reason as its
  help text; a refused or failed request shows its reason under the list.
- **The call being made again shows its wait in its row:** preparing,
  hearing with a bar, finishing, each with «Отменить».
- **Choosing an item sends its request for that row's call;** «Отменить»
  and «Повторить» send cancel and retry. The view decides nothing.
- **A run's failure and its stop by a recording show under the list,**
  where an action's failure already does (`../calls-window/SPEC.md` S-12),
  with «Повторить» for a failure.

```gherkin
Feature: Making a transcript again from the calls list

  Scenario: S-1 The item in the menu
    Given a call that is offered
    When I open its menu
    Then I can choose «Распознать заново» after Переименовать

  Scenario: S-2 A disabled item says why
    Given a call that is not offered
    When I open its menu
    Then I see the item disabled, and can read why

  Scenario: S-3 Restore in the menu
    Given a call with a previous transcript
    When I open its menu
    Then I can choose «Вернуть прежний транскрипт»

  Scenario: S-4 No restore without a previous
    Given a call without a previous transcript
    When I open its menu
    Then I see no restore item

  Scenario: S-5 Preparing in the row
    Given a run is preparing
    When I look at its row
    Then I see that it is preparing, and can cancel

  Scenario: S-6 Hearing in the row
    Given a run is hearing
    When I look at its row
    Then I see how far it has got, and can cancel

  Scenario: S-7 Finishing in the row
    Given a run is finishing
    When I look at its row
    Then I see that it is finishing, and can cancel

  Scenario: S-8 A failure under the list
    Given a run failed
    When I look at the list
    Then I can read why under it, and try again

  Scenario: S-9 A stop by a recording under the list
    Given a run was stopped by a recording
    When I look at the list
    Then I can read that a recording started

  Scenario: S-10 Choosing the item asks for that call
    Given a call that is offered
    When I choose «Распознать заново»
    Then a run is asked for that call

  Scenario: S-11 Choosing restore asks for that call
    Given a call that offers a restore
    When I choose «Вернуть прежний транскрипт»
    Then a restore is asked for that call

  Scenario: S-12 Cancel and retry are sent
    Given a run under way, and later a failed run
    When I press «Отменить», and later «Повторить»
    Then a cancel is sent, and later a retry for that call

  Scenario: S-13 Restore disabled says why
    Given a call with a previous transcript that cannot be restored now
    When I open its menu
    Then I see restore disabled, and can read why
```
