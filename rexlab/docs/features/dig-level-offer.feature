Feature: Dig: the offer of the next age level
  After strong rounds in a row at one level, the reveal offers the next
  level up, with find the pair's card and rules
  (find-the-pair-level-offer.feature, docs/age-levels.md): 3 strong
  rounds in a row, 5 once that level's offer was turned down, and
  showing the offer starts the count again. A strong round is one
  finished with no help shown; every Hatchling round is strong, as
  Hatchling has no help. Paleontologist offers nothing.

  Background:
    Given an iPad in landscape

  Scenario Outline: Three strong rounds in a row offer the next level
    Given the level switch shows <level> chosen
    And I have no strong rounds in a row and have never turned down an offer
    When I finish 3 <level> rounds in a row with no help shown
    Then the first two reveals show no offer
    And the third's offers "<question>" with <picture>

    Examples:
      | level     | question                      | picture |
      | Hatchling | TRY THE EXPLORER LEVEL?       | 🦖      |
      | Explorer  | TRY THE PALEONTOLOGIST LEVEL? | 🦴      |

  Scenario: A round with help shown starts the count again
    Given I have finished 2 strong Explorer rounds in a row
    When I finish an Explorer round after help thinned a spot
    Then I see no offer, and I need 3 strong Explorer rounds in a row for it

  Scenario: "YES" plays the next level from then on
    Given I see the offer of the Explorer level
    When I tap "YES"
    Then the offer goes and "DIG AGAIN" starts an Explorer round
    And the level switch shows Explorer chosen when I next dig

  Scenario: "NOT NOW" waits for 5
    Given I see the offer of the Explorer level on a Hatchling reveal
    When I tap "NOT NOW"
    Then the level switch still shows Hatchling chosen
    And I need 5 strong Hatchling rounds in a row for the offer

  Scenario: No offer at the top
    Given the level switch shows Paleontologist chosen
    When I finish 10 rounds with no help shown
    Then I never see an offer

  Scenario: The offer comes after the reveal's star
    Given my third strong Hatchling round digs up a new dinosaur
    When the reveal shows
    Then the star flies to "DUG UP" and the celebration plays before the offer rises
