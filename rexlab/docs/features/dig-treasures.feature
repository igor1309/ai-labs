Feature: Dig: treasures in the sand
  Now and then a round's sand holds a treasure beside the dinosaur: a
  shell, a tooth or a drop of amber, more rarely an egg nest, and most
  rarely a golden fossil (docs/dig-levels.md, "Treasures"). It lies on
  the damp bed where the dinosaur is not, so it never hides a part of
  the dinosaur. Brushed clear, it glows, hops and flies into the FIELD
  GUIDE on DIG's bar (dig-field-guide.feature). A treasure neither ends
  nor speeds the round: its sand counts toward no threshold, and the
  round plays on as if it were not there. Treasures come the same way at
  every level.

  Background:
    Given an iPad in landscape

  Scenario Outline: About one round in three holds a treasure
    Given the round's draw is <draw>
    When a round starts at any level
    Then its sand holds <treasure>

    Examples:
      | draw                                  | treasure                 |
      | in the first third                    | one treasure             |
      | past the first third                  | no treasure              |

  Scenario Outline: Some treasures are rarer than others
    Given a round holds a treasure
    When its kind is drawn
    Then it is <kind> with a chance of <chance>

    Examples:
      | kind          | chance                         |
      | golden fossil | 1 in 20                        |
      | egg nest      | 1 in 8                         |
      | shell         | an equal share of what is left |
      | tooth         | an equal share of what is left |
      | amber         | an equal share of what is left |

  Scenario: A treasure lies where the dinosaur is not
    Given a round holds a treasure
    Then the treasure lies wholly on cells that hold none of the dinosaur
    And at least one cell from the board's edge
    And nothing shows of it until its sand is brushed

  Scenario: Brushed clear, a treasure glows, hops and flies into the FIELD GUIDE
    Given a round holds a shell I have never found
    When I brush more than half of the shell's cells clear
    Then the shell glows and hops where it lies
    And it flies into the FIELD GUIDE on the bar, whose count then ticks up by one
    And "NEW!" shows by the FIELD GUIDE as it lands, since I had no shell before
    And with reduced motion the shell fades from its place and the count simply changes

  Scenario: A treasure found before flies in with no NEW!
    Given I have found a tooth before
    When I brush a round's tooth clear
    Then it glows, hops and flies into the FIELD GUIDE, whose count ticks up by one
    And no "NEW!" shows

  Scenario: A treasure neither ends nor speeds the round
    Given a round holds a treasure
    When I brush the treasure clear and nothing of the dinosaur
    Then no question comes and no gust comes
    And brushing the dinosaur brings the question or the gust at the share of its cells it does today

  Scenario: Brushing goes on while a treasure flies
    Given a treasure is flying into the FIELD GUIDE
    When I keep brushing
    Then the sand keeps clearing under my finger

  Scenario: A treasure not found goes with the gust
    Given a round holds an amber drop I have not brushed clear
    When the gust comes
    Then the amber tumbles away with the last of the sand
    And it is not kept in the FIELD GUIDE

  Scenario: A treasure is kept the moment it lands
    Given I have brushed a round's shell clear and it has landed in the FIELD GUIDE
    When I tap "HOME" before the gust
    Then the shell stays kept in the FIELD GUIDE
    But the dinosaur is not recorded as dug up (dig-progress.feature)

  Scenario: A turn of the iPad keeps the treasure as it was
    Given a round holds a treasure
    When the iPad turns to portrait and back
    Then a treasure still under sand lies where it lay, under the same sand
    And a treasure already kept stays kept, and shows no more on the board
