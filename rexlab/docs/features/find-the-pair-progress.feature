Feature: Find the pair: keeping progress
  Stars, levels, best scores and found dinosaurs are kept on this
  browser, best effort, and never disturb the other games or the
  settings.
  Its rules hold at every age level. A scenario that names a climb
  level or a number of tries plays Hatchling, whose climb levels 1 to 4
  these are (find-the-pair-levels.feature).

  Background:
    Given an iPad in landscape

  Scenario: Progress survives reopening the app
    Given I have 5 stars, I am on level 3, my level 2 best is 6 tries and Triceratops is found
    When I close and reopen the app
    Then I still have 5 stars, level 3, a level 2 best of 6 tries and Triceratops found

  Scenario: Saving leaves other games and app settings alone
    Given I have stored quiz and care progress, language, theme and age level choices
    When I finish a board and reopen the app
    Then my quiz and care progress, language, theme and age level choices are unchanged
    And saving quiz or care progress also keeps my find-the-pair progress

  Scenario Outline: Unusable progress starts afresh
    Given the stored find-the-pair progress is <state>
    When I open find the pair
    Then I am on level 1 with no stars, no best scores and no found dinosaurs
    And the level switch shows the age level
    When I finish a board
    Then I see a first best score celebration
    And that board's star, best and found dinosaurs are saved in readable progress
    And readable progress for other games is preserved

    Examples:
      | state                          |
      | absent                         |
      | malformed                      |
      | from an unknown schema version |

  Scenario: A found dinosaur no longer in the list is ignored
    Given the stored found dinosaurs include one that is no longer in the dinosaur list
    When I open "ALL DINOSAURS"
    Then the found count counts only dinosaurs in the list
    And the stored progress is not changed by opening it

  Scenario: The game works when progress cannot be read
    Given the browser cannot read stored progress
    When I open find the pair
    Then the level switch shows the age level
    When I choose Hatchling and finish a board in 6 tries
    Then I see "6" tries and a star
    And I see no best score or best score celebration
    And its dinosaurs are found while the app remains open

  Scenario: The game works when progress cannot be saved
    Given my level 1 best is 5 tries
    And the browser can read progress but cannot save it
    When I finish a level 1 board in 4 tries
    Then I see a new best score celebration and a best of 4
    And while the app remains open my stars, level and found dinosaurs count that board
    But after reloading only the previously saved progress can be restored
