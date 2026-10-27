Feature: A happy reunion reward
  Scenario: Reach the parent
    When the baby reaches the goal
    Then the board gives way to a reunion result
    And the baby and parent appear together
    And the child earns 3 stars regardless of hints and backtracking
    And the total stars increases by 3 exactly once for that round
    And a first or higher best score celebrates a new best of 3
    And a tied best does not celebrate a new record
    And AGAIN with a replay symbol and HOME with a home symbol are available

  Scenario: Replay and leave
    When the child chooses AGAIN
    Then a different maze starts with the baby at its start and no hint
    When the child chooses HOME
    Then the home page appears
    And leaving an unfinished round earns no stars
