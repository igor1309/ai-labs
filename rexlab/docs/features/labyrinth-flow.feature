Feature: Labyrinth belongs to RexLab
  Scenario: Open and return
    Given the home page is open
    Then a LABYRINTH tile with a dinosaur picture and route symbol is available
    And the Russian title is ЛАБИРИНТ
    When the child taps the tile or its featured card
    Then the maze opens directly with no welcome screen
    And the game start is counted once
    And the home control returns from the board or the result

  Scenario: Save the reward
    Given another game's progress is already saved
    When a labyrinth round is completed
    Then the total stars and best score are saved in the shared progress record
    And the other game's progress is unchanged
    And the home tile and featured card show the labyrinth total stars
    And no labyrinth progress appears on catalogue or dinosaur pages
    When the app reloads
    Then the labyrinth reward is restored
    But an unfinished board is not restored

  Scenario: Storage unavailable
    Given saved progress is malformed or storage cannot be read or written
    When the child opens and finishes the labyrinth
    Then the game remains playable and rewards work for the session
    And corrupt labyrinth values do not become displayed scores
