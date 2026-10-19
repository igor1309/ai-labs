Feature: Dig: Explorer finds three details
  Explorer adds looking for a shown detail: three find cards beside the
  sand, each a round close-up of a spot of the dinosaur
  (dig-spots.feature), found in any order. The child still brushes
  where they like.

  Background:
    Given an iPad in landscape
    And the level switch shows Explorer chosen

  Scenario: A round shows three find cards
    When a round starts
    Then I see 3 find cards beside the sand, one over another
    And each shows a round close-up of one of the dinosaur's spots, with its word under it, such as "EYE"
    And the 3 are spots of the dinosaur chosen at random, of different kinds

  Scenario: Finding a detail ticks its card
    Given a round shows the cards EYE, FOOT and TAIL
    When I brush more than half of the eye spot's cells clear
    Then the EYE card gets a tick, and a small star pops by the spot
    And the eye spot sparkles once
    And with reduced motion the tick and star appear with a short fade and nothing sparkles

  Scenario: The details are found in any order
    Given a round shows the cards EYE, FOOT and TAIL
    When I find the tail first, then the eye
    Then the TAIL and EYE cards are ticked and FOOT is not

  Scenario: The last grains blow away once all three are found
    Given I have found 2 of the 3 details
    When I find the third
    Then the rest of the sand blows away in one gust, however much of the dinosaur is still covered
    And the reveal follows (dig-reveal.feature)

  Scenario: Help shows the next detail through the sand
    Given a round has started
    When 10 seconds pass with no detail found since the start or the last find
    Then the sand over the spot of the first unfound card not yet helped thins so the detail shows through it
    And the thinning fades in, slowly, with the shared motion tokens, or with a short fade under reduced motion
    And that card's frame pulses gently, but not under reduced motion

  Scenario: Brushing where no spot lies does not hold help off
    Given a round has started
    When I keep brushing places where no spot lies for 20 seconds
    Then help shows the first unfound spot after 10 seconds all the same

  Scenario: Help that has shown stays until its detail is found
    Given help has thinned the sand over the foot spot
    When I find the eye instead
    Then the foot spot stays thinned
    And 10 seconds after finding the eye, help thins the next unfound spot, the tail's
