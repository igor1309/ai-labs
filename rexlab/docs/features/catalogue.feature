Feature: The dinosaur catalogue
  A child browses every dinosaur in the app: a list of them all with
  each one's picture, size and food, and a page for each with a big
  picture and a short description.

  Background:
    Given an iPad in landscape

  Scenario: The home page offers the catalogue as a tile
    When I open the home page
    Then I see an "ANCIENT REPTILES" tile with a 📖 symbol, a dinosaur and the count "42"
    And it is under the "COMPARE" tile, in the row's first column

  Scenario: The tile opens the list of every dinosaur
    Given I am on the home page
    When I tap the "ANCIENT REPTILES" tile
    Then I see a "HOME" button with a 🏠 symbol and the food chips beside it, in one row
    And I see no title and no count above the cards
    And I see 42 dinosaur cards, four to a row, in the order of the dinosaur list
    And the list is as wide as the screen, so its scrollbar is at the screen's edge

  Scenario: Each card shows its dinosaur
    Given I am on the list of every dinosaur
    Then each card shows the dinosaur's picture and its name in large capital letters
    And under the name its height with a 📏 symbol, its weight with a ⚖️ symbol and its food tag, all in one row
    But on a card too narrow for them, as on a smaller iPad, the height and weight drop their symbols to stay in the row

  Scenario Outline: A food tag on a card shows what a dinosaur ate in colour and symbol alone
    Given I am on the list of every dinosaur
    Then the card of <dinosaur> has a <colour> tag with <symbols> and no word, "<word>" only read out

    Examples:
      | dinosaur      | colour     | symbols | word   |
      | Tyrannosaurus | terracotta | 🥩      | MEAT   |
      | Triceratops   | green      | 🍃      | PLANTS |
      | Gallimimus    | amber      | 🥩 🍃   | BOTH   |

  Scenario: A card opens its dinosaur's page
    Given I am on the list of every dinosaur
    When I tap the card of Tyrannosaurus
    Then I see a big picture of Tyrannosaurus and its name in large capital letters
    And right under the name the "MEAT" food tag
    And its description, "A HUGE HUNTER WITH A BIG HEAD AND TINY ARMS. ITS TEETH WERE AS LONG AS BANANAS."
    And its height "3.1 M" beside "TALL" and its weight "8 T" beside "HEAVY"
    And an "ANCIENT REPTILES" button with a 📖 symbol and the position "1 / 42"

  Scenario: A page opens at once and loads its neighbours ahead
    Given I am on the list of every dinosaur
    And the picture of Velociraptor is still loading
    When I tap the card of Velociraptor
    Then I see the page of Velociraptor at once, its picture shimmering
    And the pictures of Triceratops and Brachiosaurus start loading

  Scenario: Next and previous go round the whole list
    Given I am on the page of the last dinosaur, at "42 / 42"
    When I tap the → button
    Then I see the page of Tyrannosaurus, at "1 / 42"
    When I tap the ← button
    Then I see the page of the last dinosaur again, at "42 / 42"

  Scenario: A quick double tap on an arrow goes one dinosaur on
    Given I am on the page of Tyrannosaurus
    When I tap the → button twice quickly
    Then I see the page of Triceratops, at "2 / 42"

  Scenario: Back to the list keeps the dinosaur in view
    Given I opened the page of a dinosaur far down the list
    When I tap the "ANCIENT REPTILES" button
    Then I see the list of every dinosaur with that dinosaur's card in view

  Scenario: The note about the facts is for parents
    When I open the page of a dinosaur
    Then under its facts a small note in normal case names the sources the facts were checked with

  Scenario Outline: The catalogue is in the chosen language
    Given the app is in <language>
    Then the catalogue's tile on the home page reads "<tile>", short enough for a tile among many
    When I open the page of Gallimimus
    Then I see the button "<title>", the food tag "<food>" and the description in <language>

    Examples:
      | language | tile          | title         | food |
      | English  | ANCIENT REPTILES | ANCIENT REPTILES | BOTH |
      | Russian  | ВСЕ           | ДРЕВНИЕ ЯЩЕРЫ | ВСЁ  |

  Scenario: Every dinosaur has a food type and a description
    Given the dinosaur list the app ships with
    Then every dinosaur has a food type of meat, plants or both
    And a description in English and in Russian, in capitals

  Scenario: The catalogue moves smoothly
    When I open a dinosaur's page from its card
    Then the card's picture grows into the page's picture while the rest fades, whether it shows the picture or its shimmer
    And going back shrinks it into its card again
    And the next or previous dinosaur slides in the arrow's way
    And on opening the list its cards fade and rise in one after the other
    But when the device asks for reduced motion, every change is a short fade
