Feature: Dig: the FIELD GUIDE
  The FIELD GUIDE keeps the treasures found in DIG's sand
  (dig-treasures.feature): DIG's own collection page, beside the count of
  dinosaurs dug up. It opens from DIG's bar during a round and on the
  reveal, and gives the child back where they were. Like the rest of
  DIG's progress it shows only in DIG's own screens (LAB-347).

  Background:
    Given an iPad in landscape

  Scenario Outline: The bar carries the FIELD GUIDE
    Given the app is in <language>
    When a round of DIG starts
    Then the bar shows a 📖 book symbol with the count of treasures I have found, beside the "DUG UP" chip
    And it is a button at least 60 by 60 CSS pixels, read out as "<guide>"
    And the bar's title still fits beside it, as "DIG" and "<who>"

    Examples:
      | language | guide           | who        |
      | English  | FIELD GUIDE     | WHO IS IT? |
      | Russian  | ПОЛЕВОЙ ДНЕВНИК | КТО ЭТО?   |

  Scenario: The page shows every kind of treasure
    Given I have found 3 shells and 1 egg nest, and nothing else
    When I tap the FIELD GUIDE
    Then I see the title "FIELD GUIDE" with the 📖 symbol
    And five cards: shell, tooth, amber, egg nest, golden fossil, in that order
    And the shell's card shows the shell's picture, "SHELL" and "×3"
    And the egg nest's card shows its picture, "EGG NEST" and "×1"
    And the tooth's, amber's and golden fossil's cards show only an outline of the treasure and "?"
    And the page shows "2/5" kinds found

  Scenario: The cards arrive one after another
    When I open the FIELD GUIDE
    Then the page comes in as a new screen does
    And the cards arrive one after another, 60 ms apart
    And with reduced motion the page and its cards come with one short fade

  Scenario: BACK gives me back the round where I was
    Given I am brushing a round with half of the dinosaur clear
    When I tap the FIELD GUIDE and then "BACK"
    Then I see the same round, with the same sand clear, as turning the iPad gives it back
    And the round goes on from where it was, with no new drop

  Scenario: BACK from the reveal gives the reveal back
    Given I see the reveal of Triceratops
    When I tap the FIELD GUIDE and then "BACK"
    Then I see the reveal of Triceratops, with its buttons ready at once

  Scenario: HOME leaves from the FIELD GUIDE
    Given I opened the FIELD GUIDE from a round before its gust
    When I tap "HOME"
    Then I see the home page
    And the round's dinosaur is not recorded as dug up, as leaving the round would do

  Scenario: Opening the FIELD GUIDE is not a start
    When I open the FIELD GUIDE from a round and go back
    Then no start count changes

  Scenario: A quick double tap opens the FIELD GUIDE once
    When I tap the FIELD GUIDE twice quickly
    Then I see the FIELD GUIDE
    And the second tap pressed nothing on it
    And one tap on "BACK" brings me back

  Scenario Outline: Treasure names are in capitals in every language
    Given the app is in <language>
    And I have found a golden fossil
    When I open the FIELD GUIDE
    Then the golden fossil's card reads "<name>"

    Examples:
      | language | name                  |
      | English  | GOLDEN FOSSIL         |
      | Russian  | ЗОЛОТАЯ ОКАМЕНЕЛОСТЬ  |
