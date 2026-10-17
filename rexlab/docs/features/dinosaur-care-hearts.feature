Feature: Dinosaur care: earning hearts
  Each successful care action earns a heart. Choosing a suitable item
  on the first attempt for that need earns an extra heart: two instead
  of one. A retry never removes hearts already earned.

  Background:
    Given an iPad in landscape
    And a dinosaur care visit is in progress

  Scenario: A first-choice match earns two hearts
    Given the dinosaur is thirsty and I have not offered an item for that need
    When I give it water
    Then it drinks happily
    And two hearts appear and join my visit total
    And the thirsty need is marked as met

  Scenario: Any number of retries still earns one heart for meeting the need
    Given I have offered unsuitable items for the current need three times
    And I have 2 hearts
    When I give a suitable item after the reaction
    Then the need is met
    And one heart appears and joins my visit total
    And I have 3 hearts

  Scenario: The first-choice bonus starts afresh for each need
    Given I met the hungry need after a retry and earned 1 heart
    When the thirsty need appears and I give water on my first attempt
    Then I earn 2 more hearts
    And I have 3 hearts

  Scenario: Only the first item tap during a reaction is handled
    Given the dinosaur is thirsty
    And I have 2 hearts and have not offered an item for that need
    When I tap water twice quickly and tap the bath while it is drinking
    Then it drinks only once and earns only 2 hearts, for 4 in all
    And no bath is given to the next need
    And the next need still has its first-choice opportunity

  Scenario: Taps during a refusal are ignored too
    Given Triceratops is hungry
    When I give it meat and tap plants while it is turning the meat away
    Then it keeps the hungry need and earns no hearts
    When I tap plants after the refusal has finished
    Then it eats happily and earns 1 heart

  Scenario: Every visit meets the four needs once
    Given a fresh visit
    When I meet each requested need
    Then the requests come in the order hungry, thirsty, dirty, tired
    And the next bubble appears after the current care reaction and hearts
    And met needs stay marked as met and cannot earn hearts again in that visit
    And after resting the happy dinosaur dances and leaves
    And I see the completed visit's result

  Scenario: Waiting never harms the dinosaur or changes the reward
    Given a need is waiting for my first item choice
    When I wait for five minutes before giving a suitable item
    Then the need is met and I earn 2 hearts
    And no need has worsened and no hearts have been lost

  Scenario: Care and rewards move smoothly
    When a visitor arrives, reacts to an item, gains hearts or leaves
    Then the change animates with the app's shared motion timings
    And item buttons are available again when the reaction finishes
    But when the device asks for reduced motion, the reactions and screen changes use short fades
    And the same needs, rewards and completion rules apply
