Feature: Home page: choosing the featured game
  Each day one game is featured, chosen at random with a slight lean
  towards the games started least, and it never changes while the app is
  open. Starts are counted as home-featured-progress.feature says; the
  random source and the clock are injected so the choice can be tested.

  Background:
    Given an iPad in landscape
    And the games, in tile order, are COMPARE, ALL DINOSAURS, CARE, SORT, FIND THE PAIR, SKELETONS and DIG

  Scenario: The games started least have twice the chance
    Given I have started COMPARE 9 times, ALL DINOSAURS 4, CARE 2, SORT 5, FIND THE PAIR 3, SKELETONS 2 and DIG 2
    When a featured game is chosen
    Then each game whose start count is the lowest has a weight of 2
    And every other game has a weight of 1
    And CARE, SKELETONS and DIG have 2 chances in 10 each, and every other game 1 in 10


  Scenario Outline: The random draw maps to a game in tile order
    Given I have started COMPARE 9 times, ALL DINOSAURS 4, CARE 2, SORT 5, FIND THE PAIR 3, SKELETONS 2 and DIG 2
    And the random source gives <draw>, a number from 0 up to but not including 1
    When a featured game is chosen
    Then the featured game is <game>

    Examples:
      | draw  | game          |
      | 0     | COMPARE       |
      | 0.099 | COMPARE       |
      | 0.1   | ALL DINOSAURS |
      | 0.199 | ALL DINOSAURS |
      | 0.2   | CARE          |
      | 0.399 | CARE          |
      | 0.4   | SORT          |
      | 0.499 | SORT          |
      | 0.5   | FIND THE PAIR |
      | 0.599 | FIND THE PAIR |
      | 0.6   | SKELETONS     |
      | 0.799 | SKELETONS     |
      | 0.8   | DIG           |
      | 0.999 | DIG           |


  Scenario Outline: Ties share the lowest count
    Given my start counts are <counts>
    When a featured game is chosen
    Then the weights are <weights> in tile order

    Examples:
      | counts              | weights             |
      | none started        | 2, 2, 2, 2, 2, 2, 2 |
      | all started 5 times | 2, 2, 2, 2, 2, 2, 2 |
      | 3, 0, 0, 7, 1, 4, 2 | 1, 2, 2, 1, 1, 1, 1 |
      | 1, 2, 3, 4, 5, 6, 7 | 2, 1, 1, 1, 1, 1, 1 |


  Scenario: The same game may be featured two days running
    Given yesterday's featured game was CARE
    When a featured game is chosen today
    Then CARE has its ordinary weight


  Scenario: A single game is always featured
    Given COMPARE is the only game
    When I open the home page on any day
    Then COMPARE is featured


  Scenario: A new game joins with the ordinary weights
    Given today's featured game is CARE
    And I have started every game at least once
    When an update adds a new game and I reopen the app the same day
    Then CARE is still featured
    And the new game's tile goes last, before "MORE COMING"
    And from the next day the new game, never started, has a weight of 2


  Scenario: A day is a calendar day on the device's clock
    Given the device's local time is 23:59 and today's featured game is SKELETONS
    When I reload the app at 23:59
    Then SKELETONS is still featured
    When I reload the app at 00:00 the next day
    Then a featured game is chosen for the new day and saved with that day's date


  Scenario: The featured game never changes while the app is open
    Given today's featured game is SKELETONS
    And the app stays open past midnight, or goes to the background and comes back the next day
    When I go home from a game
    Then the featured game is still SKELETONS
    When I reload or reopen the app
    Then a featured game is chosen for the new day


  Scenario: A saved date that is not today chooses afresh
    Given the saved featured game is dated a different day from today, earlier or later
    When I open the app
    Then a featured game is chosen for today
