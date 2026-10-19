Feature: Skeleton assembly: choosing a dinosaur
  A child builds a dinosaur from large bone pieces, then keeps it in a
  museum. These scenarios are its Hatchling mode: a full outline and
  four pieces, already the right way up (skeleton-assembly-levels.feature).
  Digging, mystery skeletons and odd bones belong to later issues.

  Background:
    Given an iPad in landscape

  Scenario: The home page offers the skeleton game
    When I open the home page
    Then I see a "SKELETONS" tile with a skeleton picture
    And once I have earned a skeleton star it shows my best collection score with a trophy symbol
    When I tap "SKELETONS"
    Then I see the dinosaur selection screen
    And I see "MUSEUM" with a museum symbol and "HOME" with a house symbol

  Scenario: Three different body shapes are available from the start
    Given I am on the skeleton selection screen for the first time
    Then I can choose each of these dinosaurs without unlocking it
      | dinosaur      | distinguishing shape           |
      | Tyrannosaurus | large skull and two large legs |
      | Triceratops   | horned skull and four legs     |
      | Stegosaurus   | small skull and plated back    |
    And each choice has its own dinosaur picture and name in large capitals
    And each card and button has a touch target of at least 48 by 48 CSS pixels

  Scenario: Choosing a dinosaur starts its puzzle
    Given I am on the skeleton selection screen
    When I tap Triceratops
    Then I see a faint full outline of the Triceratops skeleton
    And four large bone pieces are in a tray beside the outline
    And together the pieces make the whole skeleton, including its skull, spine, legs and tail
    And every piece is already the right way up and needs no rotation
    And no pieces are placed yet
    And I see "MUSEUM" and "HOME" with their symbols

  Scenario: A quick double tap starts one puzzle
    Given I am on the skeleton selection screen
    When I tap Tyrannosaurus twice quickly
    Then one Tyrannosaurus puzzle starts at once, whatever its pictures are doing, with four unplaced pieces
    And it is counted as one puzzle started
    And no star or museum exhibit is earned yet

  Scenario: Two choices tapped at the same moment start one puzzle
    Given I am on the skeleton selection screen
    When I tap Tyrannosaurus and, in the same moment, Triceratops
    Then one Tyrannosaurus puzzle starts at once, counted as one puzzle started

  Scenario Outline: Skeleton screens use the chosen language
    Given the app is in <language>
    When I choose a skeleton, finish it and visit the museum
    Then the controls use these words
      | control        | text        |
      | game tile      | <skeletons> |
      | museum         | <museum>    |
      | build another  | <another>   |
      | rebuild        | <rebuild>   |
      | home           | <home>      |
    And dinosaur names, guidance and the short fact are in <language>
    And all text for children is in capitals
    And every button and card has a symbol or picture beside its words

    Examples:
      | language | skeletons | museum | another        | rebuild        | home  |
      | English  | SKELETONS | MUSEUM | BUILD ANOTHER  | REBUILD        | HOME  |
      | Russian  | СКЕЛЕТЫ   | МУЗЕЙ  | СОБРАТЬ ДРУГОЙ | СОБРАТЬ ЗАНОВО | ДОМОЙ |

  Scenario Outline: Pieces and hints remain readable in either theme
    Given the app uses the <theme> theme
    When I choose a skeleton, place a piece, receive a hint and open the museum
    Then every skeleton screen uses the <theme> theme
    And the outline, bone pieces and earned stars remain distinguishable
    And hints and earned stands are identified by shape or symbols as well as colour

    Examples:
      | theme |
      | light |
      | dark  |
