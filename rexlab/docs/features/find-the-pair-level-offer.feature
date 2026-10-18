Feature: Find the pair: the offer of the next age level
  After strong boards in a row at one level, the result offers the next
  level up (docs/age-levels.md, "Offer up, never down"). A strong board
  is finished in at most twice its pairs in tries: 12 for Hatchling's 6
  pairs, 18 for Explorer's 9, 24 for Paleontologist's 12. At Hatchling
  only boards on climb level 4 count. Showing the offer starts the count
  again. "I need N" below means the next N-1 strong boards in a row show
  no offer and the Nth does. The count, its level and the levels turned
  down are kept in find-the-pair-progress.feature's progress. Hatchling
  is on climb level 4 wherever a scenario names no climb level.

  Background:
    Given an iPad in landscape

  Scenario Outline: Three strong boards in a row offer the next level
    Given the level switch shows <level> chosen
    And I have no strong boards in a row and have never turned down an offer
    When I finish 3 <level> boards in a row in <tries> tries each
    Then the first two show no offer
    And the third's result offers "<question>" with <picture>

    Examples:
      | level     | tries | question                      | picture |
      | Hatchling | 12    | TRY THE EXPLORER LEVEL?       | 🦖      |
      | Explorer  | 18    | TRY THE PALEONTOLOGIST LEVEL? | 🦴      |

  Scenario: A board that is not strong starts the count again
    Given I have finished 2 strong Explorer boards in a row
    When I finish an Explorer board in 19 tries
    Then I see no offer, and I need 3 strong Explorer boards in a row for it

  Scenario: Hatchling's boards below climb level 4 do not count
    Given the level switch shows Hatchling chosen
    And I am on climb level 3 and have finished 1 board on it
    When I finish 3 boards in 6 tries each
    Then the first moves me up to climb level 4 and does not count
    And I see no offer, and I need 1 strong board in a row for the offer

  Scenario: Playing another level starts the count again
    Given I have finished 2 strong Explorer boards in a row
    When I choose Hatchling on the level switch and finish a board in 6 tries
    And I choose Explorer and finish a board in 10 tries
    Then I see no offer, and I need 2 strong Explorer boards for the offer

  Scenario: "YES" plays the next level from then on
    Given the age level a parent picked is Hatchling
    And I see the offer of the Explorer level on a Hatchling result
    When I tap "YES"
    Then the offer goes and "PLAY AGAIN" and "HOME" can be tapped again
    And "PLAY AGAIN" deals an Explorer board
    And when I open find the pair again the level switch shows Explorer chosen
    And the age level menu still shows Hatchling chosen
    And I need 3 strong Explorer boards in a row for the Paleontologist offer
    But if I choose Hatchling again, I need 3 strong Hatchling boards for Explorer's

  Scenario Outline: A level whose offer was turned down waits for 5
    Given I see the offer of the Explorer level on a Hatchling result
    When I <answer> and then <play>
    Then the level switch shows Hatchling chosen, as before
    And I need 5 strong Hatchling boards in a row for the Explorer offer

    Examples:
      | answer                           | play                                                |
      | tap "NOT NOW"                    | play on at Hatchling                                |
      | tap "NOT NOW"                    | finish a Hatchling board in 20 tries                |
      | tap "NOT NOW"                    | finish an Explorer board and choose Hatchling again |
      | reload the app without an answer | open find the pair                                  |

  Scenario: Turning down one level's offer leaves the others' alone
    Given I tapped "NOT NOW" on the offer of the Explorer level at Hatchling
    When I choose Explorer
    Then I need 3 strong Explorer boards in a row for the Paleontologist offer

  Scenario Outline: No offer at the top, and nothing ever moves down
    Given the level switch shows <level> chosen
    When I finish 10 <level> boards in <tries> tries each
    Then I never see an offer
    And the level switch still shows <level> chosen

    Examples:
      | level          | tries |
      | Paleontologist | 24    |
      | Explorer       | 40    |

  Scenario: The offer works when progress cannot be saved
    Given the age level is Explorer and I have never used the level switch
    And my saved progress has 1 strong Explorer board in a row
    And the browser can read progress but cannot save it
    When I finish 2 Explorer boards in 12 tries each and tap "YES" on the offer
    Then "PLAY AGAIN" deals a Paleontologist board
    But after reloading the level switch shows Explorer chosen
    And I need 2 strong Explorer boards in a row for the offer

  Scenario: Progress saved before the offer reads as no strong boards yet
    Given find-the-pair progress saved before the game offered levels
    When I choose Explorer
    Then I need 3 strong Explorer boards in a row for the Paleontologist offer
