Feature: Dig: who is it?
  At Explorer and Paleontologist a round is a mystery: the dinosaur lies
  under all of the sand with no name or close-up to give it away,
  and once three quarters of its cells are clear (dig-brush.feature) the
  game asks who it is. Choices fade in with digging from 25% and become
  pickable at 75%. Their opacity is clamp((dugPercent - 25) / 50, 0, 1),
  where dugPercent is 100 times clear dinosaur cells divided by all
  dinosaur cells, unrounded. By then enough of it shows to tell it, so the pick
  is a judgement rather than a guess. The choices are its closest
  look-alikes, by the telling traits and spot kinds (dig-spots.feature)
  two dinosaurs share of those either shows, equals drawn at random. The
  child digs the whole picture if they like: brushing goes on while the
  question shows, and only the right pick brings the gust. The board
  stands in one place beside the question's column for the whole round,
  so the sand never moves under the finger. Hatchling has no question
  and no column; its board is centred and its gust comes at 95%
  (dig-brush.feature).

  Background:
    Given an iPad in landscape

  Scenario Outline: A round starts as all sand
    Given the level switch shows <level> chosen
    When a round starts
    Then the board is all sand and the title reads "DIG"
    And no name, picture or close-up tells the dinosaur under it
    And the board stands in its place beside the question's column, which holds <count> dinosaur cards at zero opacity sharing their slots with empty cards
    And each empty card is the second surface, with a 2 px line border, rounded 24, and a large "?" in the line colour, centred
    And an empty card never intercepts taps and screen readers always skip it
    And the dinosaur cards are disabled, unfocusable and hidden from screen readers

    Examples:
      | level          | count |
      | Explorer       | 3     |
      | Paleontologist | 4     |

  Scenario Outline: The question comes at three quarters
    Given a <level> round
    When I brush 75% of the dinosaur's cells clear
    Then the title reads "WHO IS IT?"
    And the <count> dinosaur cards are fully visible, each with a body picture and its dinosaur's name in capitals
    And the empty cards are invisible and the choices become pressable and available to screen readers
    And one is the dinosaur under the sand, the others its closest look-alikes, in a random order
    And every choice picture is desaturated until the child picks an answer
    And the board does not move, and nothing in the column shifts
    And no card turns or starts a timed arrival animation
    And the same dinosaur cards keep their slots and order across the threshold

    Examples:
      | level          | count |
      | Explorer       | 3     |
      | Paleontologist | 4     |

  Scenario Outline: Choices appear with the digging
    Given a round at each of Explorer and Paleontologist with each motion preference
    When I have brushed <dug>% of the dinosaur's cells clear
    Then each dinosaur card has opacity <opacity>
    And each empty card has opacity 1 minus <opacity>
    And before 75% the dinosaur cards cannot be pressed or focused and screen readers skip them
    And opacity follows the clear-cell fraction on every brush move during a stroke, without rounding to percent steps or a timed animation
    And the card container opacity never decreases as digging continues
    And a later wrong pick fades only its picture to 0.45, keeping the card container at 1
    And the dinosaur pictures stay desaturated until an answer is picked

    Examples:
      | dug | opacity |
      | 0   | 0       |
      | 25  | 0       |
      | 40  | 0.3     |
      | 50  | 0.5     |
      | 60  | 0.7     |
      | 75  | 1       |
      | 90  | 1       |

  Scenario: A round gives back its current crossfade
    Given an Explorer or Paleontologist round with choices partly visible, or a wrong pick rejected
    When I turn the iPad to portrait and back, or open the FIELD GUIDE and return
    Then the same sand, choice order, card and empty-card opacity, title and rejected picks return
    And choices remain unavailable until 75% of the dinosaur is clear

  Scenario: A new round begins with invisible choices
    Given I have partly brushed a round, or finished it after a wrong pick
    When I leave for HOME and start DIG, or start the next round with DIG AGAIN
    Then the new round has all sand, dinosaur cards at zero opacity and empty cards at full opacity
    And its title reads "DIG", no choices are rejected and none can be picked yet

  Scenario: Brushing goes on while the question shows
    Given the question shows
    When I keep brushing, even with the finger that was brushing as it came
    Then the sand keeps clearing, all of it if I like, and no gust comes

  Scenario: A wrong pick fades and stays out
    Given the question shows
    When I tap a dinosaur that is not the one under the sand
    Then its picture fades to opacity 0.45 inside the fully visible card
    And its card shows a gentle "TRY ANOTHER" mark and can no longer be tapped, even after the screen turns
    And I can brush on and pick again from the other, still-colourless cards

  Scenario: The right pick blows the sand away
    Given the question shows
    When I tap the dinosaur under the sand
    Then its picture reveals its colour with a green border and a check
    And the rest of the sand blows away in one gust, and the board takes no more brushing
    And the board stays in its place through the gust and the lift
    And the dinosaur lifts from its damp bed before the reveal (dig-brush.feature, dig-reveal.feature)

  Scenario: Naming it at the first pick earns its badge
    Given an Explorer or Paleontologist round
    When I pick the dinosaur under the sand at the first pick
    Then the reveal shows the 🦴 badge on the "DUG UP" card
    And the next reveal of that dinosaur, at any level, shows the badge too
    But a dinosaur named after a wrong pick earns no badge, and keeps one it earned before

  Scenario: The pictures may load late
    Given dinosaur cards are fading in before their pictures have loaded
    Then each card shows the shared loading look, then its picture or the failed look, all at the card's current opacity
    And every unrejected card can be picked once the question shows

  Scenario Outline: The board and the question fit on the iPads
    Given the screen is <width> by <height> CSS pixels
    When the question shows, in either language and theme
    Then the board, in the same place and size as before it came, and every card show with no scrolling
    And each card's dinosaur is at least 80 CSS pixels tall
    And each card shows its dinosaur's full name in capitals in the chosen language

    Examples:
      | width | height |
      | 1024  | 768    |
      | 1133  | 744    |
      | 1366  | 1024   |
