@next
Feature: Home page: the featured card and the tiles
  The large card on the left of the home page features one game a day, as
  an extra door beside that game's own tile. Every tile keeps a fixed place,
  so a child who cannot read yet finds a game by its picture where it was
  last time, whichever game is featured. When this is built it replaces the
  fixed COMPARE card of compare-dinosaurs-start.feature, and the home layout
  scenarios there and in catalogue.feature, dinosaur-care-start.feature
  and find-the-pair-start.feature change with it. The choice is in
  home-featured-choice.feature.

  Background:
    Given an iPad in landscape
    And the games, in the order they were added, are COMPARE, ALL DINOSAURS, CARE and SKELETONS

  Scenario: The featured card is an extra door; every tile keeps its place
    Given CARE is today's featured game
    When I open the home page
    Then the large card on the left shows CARE with its picture and its name in large capitals
    And the tiles show COMPARE, ALL DINOSAURS, CARE and SKELETONS in that order, then "MORE COMING"
    When SKELETONS is featured on another day
    Then every tile is in the same place as before


  Scenario Outline: The featured card shows what its tile shows
    Given <game> is today's featured game
    And its tile shows <badge>
    When I open the home page
    Then the large card shows <badge> too
    When I finish a game and go home
    Then the large card and the tile show the same, updated value

    Examples:
      | game          | badge                                       |
      | COMPARE       | no best score, as I have not played it yet  |
      | COMPARE       | a best score of 0 with a trophy symbol      |
      | ALL DINOSAURS | the dinosaur count                          |
      | CARE          | a best score of 7 with a trophy symbol      |
      | SKELETONS     | a collection best of 2 with a trophy symbol |


  Scenario Outline: The featured card opens its game as its tile does
    Given <game> is today's featured game
    And I am on the home page
    When I tap the large card twice quickly
    Then I see <destination>, opened once
    And it counts as one start of <game>

    Examples:
      | game          | destination                                    |
      | COMPARE       | question "1/10", once its pictures have loaded |
      | ALL DINOSAURS | the dinosaur list                              |
      | CARE          | the care welcome screen                        |
      | SKELETONS     | the skeleton selection screen                  |


  Scenario Outline: Tiles that no longer fit scroll sideways
    Given there are 8 games
    And the app is in <language>
    And the screen is <width> by <height> CSS pixels
    When I swipe the tiles to the left until they stop
    Then I can reach the last game's tile and "MORE COMING"
    And the large card stays in place
    When I swipe back to the right
    Then I see the first tiles again
    And every tile keeps its picture, its words and its count on one line

    Examples:
      | language | width | height |
      | English  | 1024  | 768    |
      | English  | 1366  | 1024   |
      | Russian  | 1024  | 768    |
      | Russian  | 1180  | 820    |


  Scenario: The featured card moves smoothly
    Given the device does not ask for reduced motion
    When I open the home page
    Then the featured card fades in with a slight lift using the shared motion tokens


  Scenario: Reduced motion fades the featured card
    Given the device asks for reduced motion
    When I open the home page
    Then the featured card appears with a short fade and no lift
