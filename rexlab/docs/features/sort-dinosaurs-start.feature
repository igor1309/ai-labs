Feature: Sort dinosaurs: starting a round and the board
  A child puts six dinosaurs into two baskets by one property, such as
  two legs or four, and learns to notice and compare what dinosaurs
  have. Each round is one board of six cards.

  Background:
    Given an iPad in landscape

  Scenario: The home page offers the sorting game as a card
    When I open the home page
    Then I see a "SORT" game card with a dinosaur and a symbol of shapes
    And the card shows my best score when there is one

  Scenario: Tapping the card starts a round
    Given I am on the home page
    When I tap the "SORT" card
    Then a round of the sorting game starts
    And I see the prompt "SORT THE DINOSAURS"
    And I see two baskets and six dinosaur cards to sort
    And each card shows its own dinosaur's picture and its name, large and in capitals

  Scenario: A long name fits its card
    When a card shows a long name, such as PACHYCEPHALOSAURUS or ПАХИЦЕФАЛОЗАВР
    Then the whole name shows on one line inside the card, as large as fits

  Scenario: The first board waits for its pictures
    Given I am on the home page
    And the pictures of the round's six dinosaurs are still loading
    When I tap the "SORT" card
    Then the home page stays on screen
    And when the pictures have loaded, or after a second at most, the round starts

  Scenario: A quick double tap on the card starts one round
    Given I am on the home page
    And the pictures of the round's six dinosaurs are still loading
    When I tap the "SORT" card twice quickly
    Then one round starts

  Scenario Outline: A round sorts by one property
    When a round sorts by <property>
    Then I see a basket "<first>" with the <first symbol> symbol
    And a basket "<second>" with the <second symbol> symbol

    Examples:
      | property | first    | first symbol     | second      | second symbol        |
      | legs     | TWO LEGS | 2 and footprints | FOUR LEGS   | 4 and footprints     |
      | diet     | PLANTS   | leaf             | MEAT        | drumstick            |
      | size     | BIG      | big footprint    | SMALL       | small footprint      |
      | horns    | HORNS    | horn             | NO HORNS    | horn, crossed out    |
      | feathers | FEATHERS | feather          | NO FEATHERS | feather, crossed out |

  Scenario: Every board is fair
    When a round is generated
    Then it holds six different dinosaurs
    And each basket gets at least two of them
    And each dinosaur belongs in exactly one basket, by the shipped facts

  Scenario: The dinosaur list can fill a board of every property
    Given the dinosaur list the app ships with
    Then for every property it holds at least six dinosaurs with a clear value
    And at least two of them for each basket

  Scenario: Only clear facts are asked
    Given a dinosaur whose property the trusted sources leave unclear, or whose picture could mislead
    When a round sorts by that property
    Then that dinosaur is not on the board

  Scenario Outline: Size sorts only clearly big or clearly small dinosaurs
    Given a dinosaur list with a dinosaur of <mass>
    When rounds sort by size
    Then that dinosaur <place>

    Examples:
      | mass    | place                                         |
      | 3000 kg | belongs in the basket BIG whenever it shows   |
      | 2999 kg | is never on the board                         |
      | 501 kg  | is never on the board                         |
      | 500 kg  | belongs in the basket SMALL whenever it shows |

  Scenario: Rounds vary
    When I start two rounds in a row in one visit, through PLAY AGAIN or from the home page, finished or left early
    Then the second round sorts by a different property than the first
