Feature: Whose Jaw welcome
  A child chooses a level before giving dinosaurs their jaws back.
  The welcome is available in English and Russian, in either theme.

  Scenario: First visit from home
    Given no Whose Jaw progress has been saved
    When I open the tooth game tile or its featured card
    Then I see the tooth title "WHOSE JAW?" and the shipped jaw and gummy dinosaur
    And the jaw chomps twice once its picture is ready
    And the selected level starts at the parent's age level
    And there is no best badge yet
    And the collection count is "0 / 16"
    And PLAY, JAW SHELF and HOME have pictures beside their words

  Scenario: Returning to my level
    Given I chose Hatchling while the parent setting was Explorer
    And my best is 3 at Hatchling and 2 at Explorer
    And I have collected 5 distinct jaws at any level
    When I reopen the game, including after a reload
    Then Hatchling is selected with a tooth best badge of 3
    And the collection count is "5 / 16"
    When I choose Explorer
    Then the best badge is 2
    And the collection count is still "5 / 16"
    And changing level preserves rewards and every other game's progress

  Scenario: A parent's new setting overrides my old choice
    Given I chose a level in Whose Jaw
    When the parent changes the age level
    Then Whose Jaw starts at the new age level
    And I can choose a different level just for Whose Jaw

  Scenario: Storage is unavailable
    Given browser storage cannot be read or written
    When I choose a level and leave and reopen the welcome
    Then my choice remains selected during this app session
    And the welcome and its actions remain usable

  Scenario: Welcome actions
    When I press PLAY
    Then I leave the welcome for the board destination at the selected level
    And one game start is counted
    When I return and press JAW SHELF
    Then I leave the welcome for the shelf destination
    And no game start or reward is counted
    When I press HOME
    Then I return to the home page

  Scenario: Pictures and motion
    Given the welcome pictures have not decoded or have failed
    Then their reserved places show the shared loading or failure appearance
    And the welcome controls work without waiting for pictures
    When reduced motion is requested
    Then the jaw entrance uses a short fade instead of chomping

  # The destinations provide navigation in the welcome build; gameplay,
  # results and the interactive museum are separate screens.
