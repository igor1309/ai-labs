Feature: Dig: Paleontologist follows clues and names the dinosaur
  Paleontologist adds order and deduction, never speed: three clues,
  spots of the unnamed dinosaur (dig-spots.feature), come one at a
  time, and once all three are found the child names the dinosaur from
  three body pictures. A round's clues are as many of its telling spots
  (dig-spots.feature) as it has, up to three, then others at random,
  coming in a random order, so the clues can tell it from the others.
  Small stars and help are as Explorer's (dig-explorer.feature). During
  the choice the board takes no brushing; sand brushed off past the
  clues before it is an accepted cost. A clue card names its
  kind with its word over a disc of sand with a 🔍, and shows its
  close-up of the picture only once its spot is found, so the detail is
  seen by digging it up, not on the card.

  Background:
    Given an iPad in landscape
    And the level switch shows Paleontologist chosen

  Scenario: One clue at a time
    When a round starts
    Then the title reads "WHO IS IT?" and no name shows
    And beside the sand I see the first clue card, large: its word over a disc of sand with a 🔍, and "1 / 3"
    And below it a closed card for the clues to come

  Scenario: Finding a clue brings the next
    Given the first clue card shows SAIL
    When I brush more than half of the sail spot's cells clear
    Then the SAIL card shows its close-up, shrinks to a ticked row above, a small star pops by the spot and the spot sparkles once
    And the second clue card slides in, large, with "2 / 3"
    And with reduced motion the cards change with a short fade and nothing sparkles

  Scenario: A spot found before its clue counts when its clue comes
    Given the first clue card shows SAIL
    And I have already brushed the claw spot clear
    When I find the sail and the second clue card shows CLAW
    Then the CLAW card is ticked at once and the third clue card follows

  Scenario: Help shows the clue's spot through the sand
    Given the second clue card has shown for 10 seconds with its spot not found
    Then the sand over its spot thins so the detail shows through it, as Explorer's help does (dig-explorer.feature)
    And it stays thinned until the spot is found, with no more help for that clue

  Scenario: Three found clues bring the choice of three
    Given I have found the first two clues
    When I find the third
    Then the three ticked clues and the sand board, smaller, stand above three cards
    And each card shows a dinosaur's body picture, with no name: the one under the sand and two others, in a random order

  Scenario Outline: The two other dinosaurs each lack a telling clue
    Given the clues are <clues>
    Then each of the other two dinosaurs lacks <lacks> among its telling traits, and the clues come in a random order

    Examples:
      | clues             | lacks          |
      | SAIL, CLAW, EYE   | SAIL           |
      | HORN, FRILL, FOOT | HORN or FRILL  |

  Scenario: Clues with no telling kind leave the others free
    Given a round whose clues are EYE, FOOT and TAIL
    Then the other two are any two other dinosaurs

  Scenario: A wrong pick fades and the child picks again
    Given I see the choice of three
    When I tap a dinosaur that is not the one under the sand
    Then that card fades and can no longer be tapped
    And I can pick again from the other two

  Scenario: The right pick blows the sand away
    Given I see the choice of three
    When I tap the dinosaur under the sand
    Then the rest of the sand blows away in one gust and the reveal follows (dig-reveal.feature)

  Scenario: Naming it at the first pick earns its badge
    When I pick the dinosaur under the sand at the first pick
    Then the reveal shows the 🦴 Paleontologist badge on the "DUG UP" card
    And the next reveal of that dinosaur, at any level, shows the badge too
    But a dinosaur named after a wrong pick earns no badge, and keeps one it earned before

  Scenario Outline: The clue cards and choice fit on the iPads
    Given the screen is <width> by <height> CSS pixels
    When I see the choice of three
    Then the board, the three clues and the three cards all show with no scrolling
    And each card is at least 200 CSS pixels wide

    Examples:
      | width | height |
      | 1024  | 768    |
      | 1133  | 744    |
      | 1366  | 1024   |
