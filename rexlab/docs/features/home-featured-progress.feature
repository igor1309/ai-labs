Feature: Home page: counting starts and keeping the featured choice
  Start counts and the day's featured game are kept on this browser beside
  the other progress, best effort, and never disturb it.

  Background:
    Given an iPad in landscape
    And the games, in tile order, are COMPARE, ANCIENT REPTILES, CARE, SORT, FIND THE PAIR, SKELETONS and DIG

  Scenario Outline: What counts as starting a game
    When <action>
    Then <game> counts one more start

    Examples:
      | action                                                          | game          |
      | a quiz round starts from the home page or from PLAY AGAIN       | COMPARE       |
      | the dinosaur list opens from the home page                      | ANCIENT REPTILES |
      | a care visit starts from NEW VISITOR or a friend is called back | CARE          |
      | a sorting round starts from its card or from PLAY AGAIN         | SORT          |
      | a board is dealt from PLAY or PLAY AGAIN                        | FIND THE PAIR |
      | a skeleton puzzle starts, a rebuild included                    | SKELETONS     |
      | a dig round starts from its tile, the large card or DIG AGAIN   | DIG           |


  Scenario: Leaving a game unfinished still counts its start
    Given I have started CARE 2 times
    When I start a care visit and leave it unfinished
    Then CARE counts 3 starts


  Scenario: Browsing inside a game is not a start
    When I open the care or find-the-pair welcome screen, a dinosaur's catalogue page, or go back from a catalogue page to the list
    Then no start count changes


  Scenario: Featured saves and game saves keep each other
    Given I have stored quiz scores, care progress, skeleton progress, language and theme choices
    When a featured game is chosen and saved
    Then my quiz scores, care progress, skeleton progress, language and theme choices are unchanged
    When I finish a quiz round, a care visit and a skeleton
    Then today's featured game and every start count are unchanged, apart from the three new starts


  Scenario Outline: Unusable featured progress chooses afresh
    Given the stored featured record is <state>
    When I open the home page
    Then a featured game is chosen with every start count at 0
    And the choice is saved in a readable featured record
    And readable progress for every game is preserved

    Examples:
      | state                                        |
      | absent                                       |
      | malformed                                    |
      | from an unknown schema version               |
      | naming a featured game that no longer exists |
      | holding a negative or fractional start count |


  Scenario: Start counts for games that no longer exist are dropped
    Given the stored start counts include a game that no longer exists
    When I open the home page
    Then the other games' start counts and today's featured game are kept
    And the unknown game is left out of the choice and of the next save


  Scenario: A browser that cannot read progress still offers a featured game
    Given the browser cannot read progress
    When I open the home page
    Then a featured game is chosen with every start count at 0
    And every tile, and the large card, opens its game


  Scenario: A browser that cannot save keeps the choice for the session
    Given the browser cannot save progress
    When I open the home page, start CARE and go home
    Then the featured game is the same as before
    And CARE's start is counted for the rest of the session
