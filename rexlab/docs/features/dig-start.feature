Feature: Dig: starting a round and the board
  A child brushes sand off a covered picture with a finger until a
  dinosaur shows (LAB-335, docs/dig-levels.md). "DIG" starts a round at
  once, with no choice screen, at the level it starts at
  (age-level-start.feature). This feature's scenarios hold at every
  level; Hatchling's gust is in dig-brush.feature, the question of
  Explorer and Paleontologist in dig-question.feature, and help and
  finds at every level in dig-help.feature.

  Background:
    Given an iPad in landscape

  Scenario: The home page offers the dig game as a tile
    When I open the home page
    Then I see a "DIG" tile with a dinosaur half under sand and a 🖌️ brush symbol
    And it stands over "MORE COMING", in the last column (home-tiles.feature)
    And the tile shows how many dinosaurs I have dug up once there is one

  Scenario: The dig tile brightens under a pointer and shows it is pressed
    Given I am on the home page
    When I hover over the "DIG" tile with a pointer
    Then the tile brightens
    When I press it
    Then it shows a pressed state before the round opens

  Scenario: Tapping the tile starts a round
    Given I am on the home page
    When I tap the "DIG" tile
    Then a round of the dig game starts at once
    And I see the sand board, the picture's 4:3 shape, as large as fits beside what the level shows
    And I see a "HOME" button with a 🏠 symbol, away from the board
    And I see a ⭐ count of the dinosaurs I have dug up, out of all of them, such as "4/42"
    But when stored progress cannot be read I see no count (dig-progress.feature)

  Scenario: The title names the game until the dinosaur is named
    When a Hatchling or Explorer round starts
    Then the title reads "DIG" with the 🖌️ symbol
    When a Paleontologist round starts
    Then the title reads "WHO IS IT?" with the 🖌️ symbol
    And on the reveal, at every level, the title reads "DIG" with the 🖌️ symbol

  Scenario: A round digs up a dinosaur not dug up yet
    Given I have dug up 4 of the dinosaurs
    When a round starts
    Then its dinosaur is one of the other 38, at random
    But once I have dug up every dinosaur, a round digs up any of them but the last round finished while the app is open

  Scenario: The sand covers the whole picture at the start
    When a round starts
    Then no part of the dinosaur shows through the sand
    And the sand fades in with the shared motion tokens, or appears with a short fade under reduced motion

  Scenario Outline: A quick double tap starts one round
    Given I am on <screen>
    When I tap "<button>" twice quickly
    Then one round starts
    And no sand is brushed by the second tap

    Examples:
      | screen                                 | button    |
      | the home page                          | DIG       |
      | the reveal of the dig game             | DIG AGAIN |

  Scenario: Home leaves the round
    Given I am in a round with half the dinosaur brushed clear
    When I tap "HOME"
    Then I am on the home page
    And the round is not recorded (dig-progress.feature)

  Scenario Outline: The words read in either language
    Given the app is in <language>
    Then the home page's tile reads "<dig>"
    And a Paleontologist round's title reads "<who>"

    Examples:
      | language | dig      | who        |
      | English  | DIG      | WHO IS IT? |
      | Russian  | РАСКОПКИ | КТО ЭТО?   |
