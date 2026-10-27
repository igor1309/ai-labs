Feature: A happy reunion reward
  Scenario: Reach the parent
    When the baby reaches the goal
    Then the board gives way to a reunion result
    And the baby and parent appear together
    And the child earns 3 stars regardless of hints and backtracking
    And three earned stars are visibly shown on every completion with shared reward animation
    And reduced motion uses short fades for the reward
    And the total stars increases by 3 exactly once for that round
    And a first or higher best score celebrates a new best of 3
    And a tied best does not celebrate a new record
    But a tied best still shows all three earned stars and the reunion
    And AGAIN with a replay symbol and HOME with a home symbol are available

  Scenario: Replay and leave
    When the child chooses AGAIN
    Then a different maze starts with the baby at its start and no hint
    And exactly one new game start is counted, even if the round is later abandoned
    When the child chooses HOME
    Then the home page appears
    And leaving an unfinished round earns no stars
