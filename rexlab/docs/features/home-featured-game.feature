@next
Feature: Home page: a featured game
  The large card on the left of the home page features one game, chosen
  each day with a slight lean towards the games played least. Every other
  game keeps its place, so a child who cannot read yet finds a game by its
  picture where it was last time.

  Background:
    Given an iPad in landscape
    And the games, in the order they were added, are COMPARE, ALL DINOSAURS, CARE and SKELETONS

  Scenario: One game is featured and the others keep their order
    Given CARE is today's featured game
    When I open the home page
    Then the large card on the left shows CARE with its picture, its name in large capitals and its best score
    And the other tiles show COMPARE, ALL DINOSAURS and SKELETONS in that order
    And the "MORE COMING" card is last
    And no game appears twice

  Scenario: The featured card opens its game as its tile would
    Given CARE is today's featured game
    When I tap the large card
    Then care opens exactly as it does from the CARE tile
    And a quick double tap opens it once

  Scenario: The games played least are slightly more likely to be featured
    Given I have started COMPARE 9 times, ALL DINOSAURS 4 times, CARE 2 times and SKELETONS 2 times
    When a featured game is chosen
    Then CARE and SKELETONS each have twice the chance of COMPARE
    And COMPARE and ALL DINOSAURS can still be chosen

  Scenario: A game never played counts as played least
    Given I have started COMPARE 3 times and never started the other games
    When a featured game is chosen
    Then ALL DINOSAURS, CARE and SKELETONS each have twice the chance of COMPARE

  Scenario: A new game joins the choice as soon as it ships
    Given I have started every game at least once
    When a new game is added
    Then it has never been started, so it is among the games played least
    And its tile goes last, before "MORE COMING"

  Scenario: Yesterday's featured game is not featured again today
    Given yesterday's featured game was CARE
    When I open the home page on a new day
    Then today's featured game is not CARE

  Scenario: The featured game stays the same all day
    Given today's featured game is SKELETONS
    When I play other games, go home, and close and reopen the app on the same day
    Then the featured game is still SKELETONS

  Scenario: The featured game never changes while the app is open
    Given today's featured game is SKELETONS
    And the app stays open past midnight
    When I go home from a game
    Then the featured game is still SKELETONS
    When I close and reopen the app
    Then a new featured game is chosen for the new day

  Scenario: Starting a game counts as a play
    Given I have started CARE 2 times
    When I start a care visit and leave it unfinished
    Then CARE counts 3 starts
    And opening the ALL DINOSAURS list counts as starting it

  Scenario: Tiles that no longer fit scroll sideways
    Given there are more game tiles than fit beside the large card
    When I swipe the tiles to the left
    Then the tiles scroll sideways and the large card stays in place
    And every tile keeps its words and count on one line at 1024, 1180 and 1366 px wide

  Scenario: The featured card moves smoothly
    When I open the home page
    Then the featured card fades in with a slight lift using the shared motion tokens
    When the device asks for reduced motion
    Then the featured card appears with a short fade

  Scenario: Featured choices leave other progress alone
    Given I have stored quiz scores, care progress, language and theme choices
    When a featured game is chosen and saved
    Then my quiz scores, care progress, language and theme choices are unchanged

  Scenario Outline: Unusable featured progress chooses afresh
    Given the stored featured game and play counts are <state>
    When I open the home page
    Then a featured game is chosen as if no game had been started
    And the new choice is saved in readable progress

    Examples:
      | state                               |
      | absent                              |
      | malformed                           |
      | from an unknown schema version      |
      | naming a game that no longer exists |

  Scenario: A browser that cannot save keeps the choice for the session
    Given the browser cannot save progress
    When I open the home page and go home from a game
    Then the featured game is the same both times
