Feature: Creatures in the catalogue that are not dinosaurs
  Flying reptiles and sea reptiles lived alongside the dinosaurs but were
  none. The catalogue shows them among the dinosaurs as ANCIENT REPTILES,
  says on each page which they are, and measures each by what fits its
  shape: a dinosaur by its height at the hip, a flying reptile by its
  wingspan and a sea reptile by its length.

  Background:
    Given an iPad in landscape

  Scenario Outline: A flying or sea reptile's page names its group
    Given the app is in <language>
    When I open the page of a <group>
    Then just over its name it reads "<label>"
    And its size is its <measure>, beside "<word>"

    Examples:
      | language | group          | label          | measure  | word   |
      | English  | flying reptile | FLYING REPTILE | wingspan | WINGS  |
      | English  | sea reptile    | SEA REPTILE    | length   | LONG   |
      | Russian  | flying reptile | ЛЕТАЮЩИЙ ЯЩЕР  | wingspan | КРЫЛЬЯ |
      | Russian  | sea reptile    | МОРСКОЙ ЯЩЕР   | length   | ДЛИНА  |

  Scenario: A dinosaur's page names no group
    When I open the page of Tyrannosaurus
    Then nothing reads over its name
    And its size is its height "3.1 M", beside "TALL"

  Scenario: A card never shows a wingspan or a length as a height
    Given I am on the list of every dinosaur
    Then a dinosaur's card shows its height with a 📏 symbol
    But a flying reptile's card shows its wingspan, and a sea reptile's its length, with a ↔ symbol

  Scenario: A small creature's weight is in grams
    When the page of a creature weighing half a kilogram opens
    Then its weight reads "500 G"

  Scenario: Every creature has a group and its group's size alone
    Given the dinosaur list the app ships with
    Then every creature is a dinosaur, a flying reptile or a sea reptile
    And a dinosaur has a height, a flying reptile a wingspan and a sea reptile a length, and none has another

  Scenario: The flying and sea reptiles play in some games
    Then COMPARE weighs them against the dinosaurs, and asks no height of them
    And SORT, FIND THE PAIR and DIG deal them among the dinosaurs
    But none visits in CARE and none is built in SKELETONS

  Scenario: SORT deals a reptile only where its answer is known
    Then no flying or sea reptile is dealt on a legs board
    And every one goes in NO HORNS
    And a flying reptile's fuzz puts it in NOT KNOWN YET, and no sea reptile is dealt on a feathers board

  Scenario: Look-alikes tell a reptile by its wings or flippers
    Then a flying reptile looks like the other fliers and the winged dinosaurs
    And a long-necked swimmer looks like the other long necks at sea, and a big-headed one like the other big heads
    And in DIG a flier shows a WING and a swimmer a FLIPPER, both telling kinds
