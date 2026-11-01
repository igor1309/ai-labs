Feature: Home page: the featured card and the tiles
  The large card on the left of the home page features one game a day,
  in place of that game's tile: no game is on the page twice. The other
  tiles keep their order, each moving up one place where the featured
  game's tile would stand. The row scrolls and fits its words as
  home-tiles.feature says. The choice is in home-featured-choice.feature.

  Background:
    Given an iPad in landscape
    And the games, in tile order, are COMPARE, ANCIENT REPTILES, FIND THE PAIR, SKELETONS, DIG, SORT, CARE and SAND WRITING

  Scenario: The featured game has the large card and no tile
    Given CARE is today's featured game
    When I open the home page
    Then the large card on the left shows CARE with its picture and its name in large capitals
    And the tiles show COMPARE, ANCIENT REPTILES, FIND THE PAIR, SKELETONS, DIG, SORT and SAND WRITING in that order, then "MORE COMING"
    When SKELETONS is featured on another day
    Then the tiles show COMPARE, ANCIENT REPTILES, FIND THE PAIR, DIG, SORT, CARE and SAND WRITING in that order, then "MORE COMING"


  Scenario Outline: The featured card shows what its tile would show
    Given <game>'s tile shows <badge> on a day another game is featured
    When <game> is today's featured game and I open the home page
    Then the large card shows <badge> too
    When I play it and come back home
    Then the large card shows the value its tile would, updated if playing changed it

    Examples:
      | game          | badge                                       |
      | COMPARE       | no best score, as I have not played it yet  |
      | COMPARE       | a best score of 0 with a trophy symbol      |
      | ANCIENT REPTILES | the dinosaur count                          |
      | CARE          | a best score of 7 with a trophy symbol      |
      | SORT          | a best score of 6 with a trophy symbol      |
      | FIND THE PAIR | 120 stars with a star symbol                |
      | SKELETONS     | a collection best of 2 with a trophy symbol |
      | DIG           | 7 dinosaurs dug up with a star symbol       |
      | SAND WRITING  | no score or badge                          |


  Scenario Outline: The featured card starts its game
    Given <game> is today's featured game
    And I am on the home page
    When I tap the large card twice quickly
    Then I see <destination>, opened once
    And <game> counts one more start

    Examples:
      | game          | destination                                               |
      | COMPARE       | question "1/10"                                           |
      | ANCIENT REPTILES | the dinosaur list                                         |
      | SORT          | a sorting round, at once, whatever its pictures are doing |
      | DIG           | a dig round, at once                                      |
      | SAND WRITING  | a blank full-screen sand canvas                          |


  Scenario Outline: The featured card opens a game's first screen
    Given <game> is today's featured game
    And I am on the home page
    When I tap the large card twice quickly
    Then I see <destination>, opened once
    And no start of <game> is counted yet
    When I <begin>
    Then <game> counts one more start

    Examples:
      | game          | destination                      | begin                 |
      | CARE          | the care welcome screen          | tap "NEW VISITOR"     |
      | FIND THE PAIR | the find-the-pair welcome screen | tap "PLAY"            |
      | SKELETONS     | the skeleton selection screen    | choose a dinosaur     |


  Scenario: The large card stays while the tiles scroll
    Given I am on the home page
    When I swipe the tiles to the left until they stop
    Then I see "MORE COMING" at the right edge
    And the large card stays in place, showing today's featured game


  Scenario: The featured card moves smoothly
    Given the device does not ask for reduced motion
    When I open the home page
    Then the featured card fades in with a slight lift using the shared motion tokens


  Scenario: Reduced motion fades the featured card
    Given the device asks for reduced motion
    When I open the home page
    Then the featured card appears with a short fade and no lift
