Feature: A happy reunion reward
  Scenario: Reach the parent
    When the baby reaches the goal
    Then the board gives way to a reunion result
    And the baby and parent appear together
    And the child earns 3 stars regardless of hints and backtracking
    And three earned stars are visibly shown on every completion with shared reward animation
    And reduced motion uses short fades for the reward
    And the total stars increases by 3 exactly once for that round
    And a first or higher best score at the played level celebrates a new best of 3
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

  Scenario: Choose a challenge
    Given a reunion result is shown
    Then the shared three-level switch appears above AGAIN
    And AGAIN starts the chosen level with its own best score
    And the three stars have the same value at every level
    And before a declined offer, after three consecutive solved rounds without hints at a lower level the shared next-level offer appears
    And accepting or declining follows the shared level-offer rules

  Scenario: Declining a level offer
    Given the child declines or leaves an unanswered level offer at Hatchling
    When the child solves three and then four consecutive Hatchling rounds without hints
    Then no offer appears
    When the child solves the fifth consecutive Hatchling round without hints
    Then Explorer is offered
    And a hinted round or a round at another level resets the streak
