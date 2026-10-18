Feature: Find the pair: the offer of the next age level
  After strong boards in a row at one level, the result offers the next
  level up (docs/age-levels.md, "Offer up, never down"). A strong board
  is finished in at most twice its pairs in tries: 12 for Hatchling's 6
  pairs, 18 for Explorer's 9, 24 for Paleontologist's 12. At Hatchling
  only boards on climb level 4 count. The count, and the level it is at,
  is kept in this game's progress (find-the-pair-progress.feature).

  Background:
    Given an iPad in landscape

  Scenario Outline: Three strong boards in a row offer the next level
    Given the level switch shows <level> chosen
    And at Hatchling I am on climb level 4
    And I have never been offered a level in find the pair
    When I finish 3 <level> boards in a row in <tries> tries each
    Then the first two show no offer
    And the third's result offers "<question>" with <picture>

    Examples:
      | level     | tries | question                      | picture |
      | Hatchling | 12    | TRY THE EXPLORER LEVEL?       | 🦖      |
      | Explorer  | 18    | TRY THE PALEONTOLOGIST LEVEL? | 🦴      |

  Scenario Outline: A board that is not strong starts the count again
    Given the level switch shows Explorer chosen
    And I have finished 2 strong Explorer boards in a row
    When I finish an Explorer board in <tries> tries
    Then I see no offer
    And I need 3 more strong boards in a row for the offer

    Examples:
      | tries |
      | 19    |
      | 30    |

  Scenario: Hatchling's boards below climb level 4 do not count
    Given the level switch shows Hatchling chosen
    And I am on climb level 3 and have finished 1 board on it
    When I finish 3 boards in 6 tries each
    Then the first moves me up to climb level 4 and does not count
    And I see no offer, and I need 1 more strong board in a row for the offer

  Scenario: Playing another level starts the count again
    Given I am on climb level 4
    And I have finished 2 strong Explorer boards in a row
    When I choose Hatchling on the level switch and finish a board in 6 tries
    And I choose Explorer and finish a board in 10 tries
    Then I see no offer
    And I need 2 more strong Explorer boards in a row for the offer

  Scenario: "YES" plays the next level from then on
    Given the age level a parent picked is Hatchling
    And I see the offer of the Explorer level on a Hatchling result
    When I tap "YES"
    Then the offer goes and the result shows "PLAY AGAIN" and "HOME" again
    And "PLAY AGAIN" deals an Explorer board
    And when I open find the pair again the level switch shows Explorer chosen
    And the age level menu still shows Hatchling chosen
    And 3 strong Explorer boards in a row then offer the Paleontologist level

  Scenario: "NOT NOW" keeps the level and offers again only after 5 more
    Given I see the offer of the Explorer level on a Hatchling result
    When I tap "NOT NOW"
    Then the offer goes and "PLAY AGAIN" deals a Hatchling board
    And 4 more strong Hatchling boards in a row show no offer
    But the 5th shows it again

  Scenario: An offer left unanswered counts as "NOT NOW"
    Given I see the offer of the Explorer level on a Hatchling result
    When I reload the app and open find the pair
    Then the level switch shows Hatchling chosen
    And I need 5 strong Hatchling boards in a row for the offer

  Scenario Outline: No offer at the top, and nothing ever moves down
    Given the level switch shows <level> chosen
    When I finish 10 <level> boards in <tries> tries each
    Then I never see an offer, or any words that a board went badly
    And the level switch still shows <level> chosen

    Examples:
      | level          | tries |
      | Paleontologist | 24    |
      | Explorer       | 40    |

  Scenario: The offer works when progress cannot be saved
    Given the age level is Explorer and I have never used the level switch
    And the browser can read progress but cannot save it
    And I have finished 2 strong Explorer boards in a row
    When I finish another in 12 tries and tap "YES"
    Then "PLAY AGAIN" deals a Paleontologist board
    But after reloading the level switch shows Explorer chosen
    And I need 3 strong Explorer boards in a row for the offer

  Scenario: Progress saved before the offer reads as no strong boards yet
    Given find-the-pair progress saved before the game offered levels
    And the level switch shows Explorer chosen
    When I finish 2 Explorer boards in 18 tries each
    Then I see no offer
    But the 3rd strong board in a row shows the offer of the Paleontologist level
