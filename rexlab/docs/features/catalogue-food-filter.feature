@next
Feature: The dinosaur catalogue: choosing dinosaurs by their food
  A child shows only the dinosaurs that ate meat, plants or both, with
  chips that look like the food tags on the cards, so a child who cannot
  read yet picks one by its colour and symbol. With ALL chosen the
  catalogue is as catalogue.feature tells.

  Background:
    Given an iPad in landscape

  Scenario: The list offers a chip for each food
    When I open "ALL DINOSAURS"
    Then under the title I see the chips "ALL", "MEAT", "PLANTS" and "BOTH", in that order
    And "ALL" has a 📖 symbol and the count "42"
    And "MEAT" is terracotta with a 🥩 symbol and the count "16"
    And "PLANTS" is green with a 🍃 symbol and the count "23"
    And "BOTH" is amber with 🥩 🍃 symbols and the count "3"
    And "ALL" is chosen
    And every chip is big enough for a small finger

  Scenario: A chip shows only its dinosaurs
    Given I am on the list of every dinosaur
    When I tap "MEAT"
    Then "MEAT" is chosen and "ALL" is not
    And I see only the 16 cards with the "MEAT" tag, in the order of the dinosaur list
    And the count beside the title is "16"

  Scenario: ALL shows every dinosaur again
    Given I chose "PLANTS"
    When I tap "ALL"
    Then I see all 42 cards and the count "42"

  Scenario: Tapping the chosen chip changes nothing
    Given I chose "BOTH"
    When I tap "BOTH" again
    Then I still see the 3 cards with the "BOTH" tag

  Scenario: The found count counts the dinosaurs shown
    Given I have found Tyrannosaurus, Velociraptor and Triceratops
    When I open "ALL DINOSAURS" and tap "MEAT"
    Then I see the count "2 / 16" with a two-cards symbol beside the title
    And the cards of Tyrannosaurus and Velociraptor have a found stamp

  Scenario: Next and previous go round the dinosaurs shown
    Given I chose "MEAT"
    When I tap the card of Tyrannosaurus
    Then I see its page at "1 / 16"
    When I tap the ← button
    Then I see the page of the last meat-eater in the list, at "16 / 16"
    When I tap the → button twice
    Then I see the page of Velociraptor, at "2 / 16"

  Scenario: Back to the list keeps the chip chosen
    Given I chose "PLANTS" and opened the page of a plant-eater
    When I tap the "ALL DINOSAURS" button
    Then "PLANTS" is still chosen with the 23 cards shown
    And the card of the dinosaur I last saw is in view

  Scenario: The list opens on ALL after HOME
    Given I chose "MEAT"
    When I tap "HOME" and open "ALL DINOSAURS" again
    Then "ALL" is chosen and I see all 42 cards

  Scenario: A chip changes the list smoothly
    Given I am on the list of every dinosaur
    When I tap "BOTH"
    Then the chosen look moves to "BOTH"
    And the cards shown fade and rise in one after the other
    But when the device asks for reduced motion, the change is a short fade

  Scenario Outline: The chips are in the chosen language
    Given the app is in <language>
    When I open "<title>"
    Then I see the chips "<all>", "<meat>", "<plants>" and "<both>"

    Examples:
      | language | title         | all | meat | plants   | both |
      | English  | ALL DINOSAURS | ALL | MEAT | PLANTS   | BOTH |
      | Russian  | ВСЕ ДИНОЗАВРЫ | ВСЕ | МЯСО | РАСТЕНИЯ | ВСЁ  |

  Scenario: The chips read well in both themes
    Given the app is in the dark theme
    When I open "ALL DINOSAURS"
    Then every chip's word and count keep at least 4.5:1 contrast with the chip
    And the chosen chip stands out from the others by more than its colour
