@next
Feature: Coloring result and reward
  The score is a collection count, never a rating of the picture. Each
  separate nonempty work earns exactly one star on its first successfully
  saved completion. The collection best is its highest saved number of
  completed works at Explorer; it is not an average of artistic scores.
  The best is derived from the saved completed count, not stored separately.
  Within the current collection the best equals the completed count: the first saved
  completion celebrates FIRST BEST and every additional work NEW BEST.
  Stars mark works in this game, not a new shared spendable currency.

  Scenario: Complete a nonempty work
    Given an uncompleted work contains one visible dot and the completed collection is 2
    When I choose DONE and saving the completion succeeds
    Then the result shows that work’s creature coming alive with its own paint
    And one earned star animates and the completed collection becomes 3
    And a new Explorer collection best of 3 celebrates
    And the work including its undo history, completion flag, reward flag and collection count are saved together
    And EDIT, GALLERY, NEW WORK and HOME have symbols beside their words
    And no accuracy, coverage, speed or color-choice grade is shown

  Scenario: Finish the same work again
    Given a work has already earned its star
    When I edit it and choose DONE again with nonempty paint
    Then its updated paint is saved and comes alive on the result
    And its existing star is shown without a new earned-star or best celebration
    And the completed collection, total stars and Explorer best do not increase
    When I reopen the app and finish that same work again
    Then it still earns no additional star

  Scenario: Empty work cannot finish
    Given a new work has no paint or I have undone all of its paint
    Then DONE is unavailable
    When I try to activate DONE with touch or keyboard
    Then no result, completed work, star or record is created
    And the same rule applies to an already completed work whose paint I undid to empty
    And its previously earned star and completed count are retained

  Scenario: Rapid or repeated completion commits once
    Given a nonempty draft
    When I activate DONE twice before saving finishes, even with keyboard or distant taps
    Then only one completion is committed for that work identity
    And input on the departing screen does not activate a result action
    And revisiting the result or restoring after an interrupted transition duplicates no reward

  Scenario: Failed completion stays editable
    Given a nonempty draft and a completed collection of 2
    When I choose DONE and saving fails
    Then I remain in the workshop with my paint intact
    And the shared save-error panel offers RETRY, KEEP EDITING and HOME WITHOUT SAVING with symbols
    And HOME WITHOUT SAVING requires confirmation that the current changes will be lost
    And confirming returns HOME with only the last durable revision retained
    And KEEP EDITING closes the panel and retains the current paint
    And no result, completion, star or best celebration is claimed
    When I retry and saving succeeds
    Then the result opens with exactly one newly earned star and a collection of 3

  Scenario: New work earns independently
    Given one Stegosaurus work has earned its star
    When I make and successfully complete another nonempty work
    Then the second work earns one star even if its colors match the first
    And the completed collection and Explorer best become 2

  Scenario: Completion freezes its accepted revision
    Given a nonempty draft with a pending stroke save
    When I choose DONE
    Then further painting, fills, UNDO and tool changes are disabled until completion succeeds or fails
    And all earlier accepted edits save in order before that same revision completes
    When I attempt to undo or draw while completion is pending
    Then the accepted paint is unchanged and the result uses that paint with one reward
    And on any save failure editing is restored with that paint intact and no completion reward


  Scenario Outline: Both creatures share the collection and reward rules
    Given a nonempty saved <creature> work
    When I choose DONE
    Then its own painted artwork and localized uppercase creature name appear on the result
    And the first completion earns exactly one star in the shared coloring collection
    When I choose EDIT and complete it again
    Then its artwork and editable history are retained without another star
    When I choose NEW WORK from the result
    Then another unpainted <creature> opens under a new identity

    Examples:
      | creature    |
      | Stegosaurus |
      | Triceratops |
