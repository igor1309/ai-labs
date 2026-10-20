Feature: Dig: help and finds
  A child who stops uncovering the dinosaur gets help at every level: a
  spot of it (dig-spots.feature) shows faintly through the sand. Help
  never clears a cell or finds a spot, so the child still digs it up.
  Help counts only time the round shows, in landscape with the app
  shown, as the skeleton game's help does. A spot brushed clear shines
  once where it lies, a ring and a small star, which counts towards
  nothing: the round's one star is its dinosaur's (dig-reveal.feature).

  Background:
    Given an iPad in landscape

  Scenario Outline: Help thins a spot after ten quiet seconds
    Given a <level> round has started
    When 10 seconds pass with no more of the dinosaur cleared since the start, the last clearing or the last help
    Then the sand over the next spot neither found nor helped thins, so its detail shows through it
    And the thinning fades in slowly, or with a short fade under reduced motion
    And no cell clears and no spot is found

    Examples:
      | level          |
      | Hatchling      |
      | Explorer       |
      | Paleontologist |

  Scenario: Only uncovering more of the dinosaur restarts the wait
    Given 9 seconds have passed with nothing cleared
    When I brush sand already clear, or sand off the dinosaur
    Then help comes a second later
    But brushing that clears more of the dinosaur starts the 10 seconds again

  Scenario: Help comes again while the child is stuck
    Given a round whose spots are, in help's order, EYE, CLAW, FOOT and TAIL
    When nothing more of the dinosaur clears for 40 seconds
    Then help thins the eye's spot after 10 seconds, the claw's after 20, the foot's after 30 and the tail's after 40

  Scenario: Help skips found spots and stays until its spot is found
    Given I have found the eye
    When help comes
    Then it thins the next unfound spot, the claw's, which stays thinned until I find it

  Scenario: Help waits while the round is out of sight
    Given 4 seconds have passed with nothing cleared
    When the app goes into the background, or the iPad turns to portrait, and comes back
    Then help comes 6 seconds later
    And leaving for HOME stops the wait, and the next round's starts from nothing

  Scenario: A find shines once where it lies
    Given a round has started
    When I brush more than half of a spot's cells clear, in any order
    Then a ring spreads from the spot, and a small star pops by it as it sparkles once
    And with reduced motion nothing shines
    And a spot found once never shines again, even after the screen turns
