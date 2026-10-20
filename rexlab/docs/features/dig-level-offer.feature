Feature: Dig: the offer of the next age level
  After strong rounds in a row at one level, the reveal offers the next
  level up, with find the pair's rules
  (find-the-pair-level-offer.feature, docs/age-levels.md): 3 strong
  rounds in a row, 5 once that level's offer was turned down by "NOT
  NOW" or left unanswered, and showing the offer starts the count again.
  The offer is find the pair's card
  (find-the-pair-level-offer-result.feature), over the reveal: the next
  level's picture, the question, "YES" with a tick symbol and "NOT NOW"
  with a cross symbol, rising in once the reveal's own rewards have
  played, and while it shows the reveal under it cannot be tapped. A
  strong round is one finished with no help shown; every Hatchling round
  is strong, as Hatchling has no help. Paleontologist offers nothing.

  Background:
    Given an iPad in landscape

  Scenario Outline: Three strong rounds in a row offer the next level
    Given the level switch shows <level> chosen
    And I have no strong rounds in a row and have never turned down an offer
    When I finish 3 <level> rounds in a row with no help shown
    Then the first two reveals show no offer
    And the third's offers "<question>" with <picture>, "YES" with a tick and "NOT NOW" with a cross

    Examples:
      | level     | question                      | picture |
      | Hatchling | TRY THE EXPLORER LEVEL?       | 🦖      |
      | Explorer  | TRY THE PALEONTOLOGIST LEVEL? | 🦴      |

  Scenario Outline: A round that is not strong at this level starts the count again
    Given I have finished 2 strong Explorer rounds in a row
    When I finish <round>
    Then I see no offer, and I need 3 strong Explorer rounds in a row for it

    Examples:
      | round                                       |
      | an Explorer round after help thinned a spot |
      | a Hatchling round                           |

  Scenario: "YES" plays the next level from then on
    Given I see the offer of the Explorer level on a Hatchling reveal
    When I tap "YES"
    Then the offer goes and the level switch shows Explorer chosen
    And "DIG AGAIN" starts an Explorer round, and so does the "DIG" tile

  Scenario: "NOT NOW" waits for 5
    Given I see the offer of the Explorer level on a Hatchling reveal
    When I tap "NOT NOW"
    Then the level switch still shows Hatchling chosen
    And I need 5 strong Hatchling rounds in a row for the offer
    But at Explorer 3 strong rounds in a row still offer Paleontologist

  Scenario: No offer at the top
    Given the level switch shows Paleontologist chosen
    When I finish 10 rounds with no help shown
    Then I never see an offer

  Scenario: The offer comes after the reveal's star
    Given my third strong Hatchling round digs up a new dinosaur
    When the reveal shows
    Then the star flies onto the "DUG UP" card and the celebration plays before the offer rises

  Scenario Outline: An offer left unanswered is turned down
    Given I see the offer of the Explorer level on a Hatchling reveal
    When I <leave> without answering it
    Then the level switch still shows Hatchling chosen
    And I need 5 strong Hatchling rounds in a row for the offer

    Examples:
      | leave            |
      | reload the app   |
      | close the app    |

  Scenario Outline: A quick double tap answers once
    Given I see the offer of the Explorer level on a Hatchling reveal
    When I double tap "<answer>" quickly
    Then the offer is answered "<answer>" once and goes
    And the second tap presses nothing on the reveal under it

    Examples:
      | answer  |
      | YES     |
      | NOT NOW |

  Scenario Outline: Leaving before the offer rises in keeps it due
    Given I have finished 2 strong Hatchling rounds in a row
    And I finish a third
    When I <leave> before the offer begins to rise in
    Then the offer was not shown and does not count as unanswered
    And my next strong Hatchling round offers the Explorer level

    Examples:
      | leave            |
      | tap "DIG AGAIN"  |
      | tap "HOME"       |
      | reload the app   |
