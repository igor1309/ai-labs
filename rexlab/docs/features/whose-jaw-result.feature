Feature: Celebrate five jaws returned to their dinosaurs
  Every completed round earns stars and keeps the best at its played level.
  Rewards and all child-facing words work in English and Russian.

  Scenario Outline: Stars count wrong tries across the whole round
    Given I play Whose Jaw at any of its three levels
    When I finish all five jaws with <errors> wrong tries
    Then the result shows <stars> earned stars out of three
    And pictures of all five placed jaws appear
    And the best for the played level is saved without lowering an earlier best
    And other levels keep their own bests
    Examples:
      | errors    | stars |
      | 0         | 3     |
      | 1         | 2     |
      | 2 or more | 1     |

  Scenario: A first best and an improved best celebrate
    When I finish my first round at a level
    Then its first best celebrates with stars and confetti
    When I finish a later round with more stars at that level
    Then NEW BEST appears and the earlier best gives way to the higher best
    But a tied or lower score does not celebrate a new best

  Scenario: New shelf finds celebrate once
    When I successfully place a jaw at any level
    Then its collection entry is saved even if I leave the unfinished round
    When I finish the round
    Then only jaws collected for the first time in this round fly onto a small wooden shelf
    And replaying already collected jaws does not announce new finds
    And an unfinished round awards no stars or strong-round count

  Scenario: Play again or visit another screen
    Given the result is shown
    Then PLAY AGAIN, JAW SHELF and HOME have matching symbols
    When I choose PLAY AGAIN
    Then a fresh five-jaw round starts at my remembered level with errors reset
    And a quick double tap starts it once
    When I choose JAW SHELF from a result
    Then the shelf destination opens
    When I choose HOME from a result
    Then home opens with the saved collection count
    And bests, collected jaws and my level choice survive reload

  Scenario: Strong rounds offer the next level after the rewards
    Given I finish three consecutive rounds at Hatchling or Explorer with at most one wrong try each
    Then the next level is offered after the stars, best and shelf animations end
    And result controls stay blocked until the offer finishes leaving
    When I choose YES
    Then replay uses the next level and remembers it without changing the parent's setting
    When I choose NOT NOW or leave a shown offer unanswered
    Then five consecutive strong rounds at that level are needed for another offer
    And a round with two or more errors or at another level restarts the streak
    And Paleontologist never offers a higher level

  Scenario: Leaving before an offer and pausing behind the turn gate
    When I leave the result before its offer rises
    Then its timer is cancelled and a late callback has no effect
    And the offer is available after the next strong round
    When the orientation gate covers the result
    Then offer arrival and dismissal waits stop until the gate clears

  Scenario: Pictures and reduced motion keep rewards usable
    Given result pictures are loading or have failed
    Then every picture keeps its place and navigation remains usable
    And images have localized dinosaur names for screen readers
    When reduced motion is requested
    Then the jaw pile and shelf flights use short fades
