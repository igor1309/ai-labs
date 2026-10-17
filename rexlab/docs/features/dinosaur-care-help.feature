@next
Feature: Dinosaur care: meeting needs
  Each need is shown in a picture bubble. A suitable item meets it; any
  other item gets a gentle reaction and another try, never a wrong mark.

  Background:
    Given an iPad in landscape
    And a dinosaur care visit is in progress

  Scenario Outline: The picture bubble explains the current need
    Given the dinosaur is <need>
    Then its bubble shows <picture>
    And the <need> symbol is highlighted in the four-need progress display

    Examples:
      | need    | picture                                    |
      | hungry  | an empty bowl, the same for every dinosaur |
      | thirsty | water                                      |
      | dirty   | a bath with bubbles                        |
      | tired   | a nest with a sleeping symbol              |

  Scenario: The hungry bubble does not give away the food
    Given Tyrannosaurus is hungry
    Then its bubble shows neither meat nor plants
    And I choose its food from what I know about it

  Scenario Outline: Food follows the shared diet data
    Given <dinosaur> is hungry
    And its diet in the shared dinosaur list is <diet>
    When I give it <item>
    Then it <reaction>

    Examples:
      | dinosaur      | diet   | item   | reaction                       |
      | Tyrannosaurus | meat   | meat   | eats happily and is not hungry |
      | Tyrannosaurus | meat   | plants | gently turns the food away     |
      | Triceratops   | plants | plants | eats happily and is not hungry |
      | Triceratops   | plants | meat   | gently turns the food away     |
      | Gallimimus    | both   | plants | eats happily and is not hungry |
      | Gallimimus    | both   | meat   | eats happily and is not hungry |
      | Oviraptor     | both   | plants | eats happily and is not hungry |
      | Oviraptor     | both   | meat   | eats happily and is not hungry |

  Scenario: A dinosaur that eats both takes either food
    Given the dinosaur is hungry and its shared diet is both
    When I give it plants or meat on my first attempt
    Then it eats happily, the hungry need is met and I earn 2 hearts

  Scenario Outline: Water, a bath and a nest meet their matching needs
    Given the dinosaur is <need>
    When I give it <item>
    Then it <reaction>
    And that need is met

    Examples:
      | need    | item  | reaction                  |
      | thirsty | water | drinks happily            |
      | dirty   | bath  | becomes clean with bubbles |
      | tired   | nest  | rests happily in the nest |

  Scenario Outline: An unrelated item invites another try
    Given the dinosaur is <need>
    And I have 2 hearts
    When I give it <item>
    Then it reacts gently and keeps its current need
    And the bubble now shows a suitable item to try
    And I still have 2 hearts
    And I see no cross, failure message or lost-heart animation
    And I can try another item after the reaction

    Examples:
      | need    | item   |
      | hungry  | water  |
      | thirsty | nest   |
      | dirty   | plants |
      | tired   | bath   |

  Scenario: Unsuitable food also invites a retry without taking hearts
    Given Triceratops is hungry
    And I have 0 hearts
    When I give it meat
    Then it gently turns the food away
    And the bubble now shows plants to try
    And I still have 0 hearts
    And I see no cross or failure message
    When I give it plants after the reaction
    Then it eats happily
    And I have 1 heart
