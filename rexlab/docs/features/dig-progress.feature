Feature: Dig: stored progress
  The dig game keeps, in the browser beside the other games' progress,
  the dinosaurs dug up, the dinosaurs named at the first pick at
  Paleontologist, the child's choice on the level switch and its level
  offer (dig-level-offer.feature). Dug-up dinosaurs are one collection
  across all levels (docs/age-levels.md, "Same rewards").

  Background:
    Given an iPad in landscape

  Scenario: A finished round is recorded
    Given I have dug up Stegosaurus
    When I dig up Triceratops
    Then my stored progress holds Stegosaurus and Triceratops as dug up

  Scenario: A round left early is not recorded
    Given I have dug up 4 dinosaurs
    And I am in a round with all but the gust done
    When I tap "HOME"
    Then I have still dug up 4 dinosaurs, and the round counts towards no offer

  Scenario: Other games' progress is kept
    Given stored progress of every other game from before the dig game
    When I finish a round of the dig game
    Then every other game's progress is unchanged

  Scenario Outline: Unusable stored progress counts as none
    Given the stored progress is <state>
    When I dig up a dinosaur
    Then I see a first best score celebration and "1/42"
    And the stored progress is replaced by a readable record

    Examples:
      | state                          |
      | unreadable                     |
      | from an unknown schema version |

  Scenario: A dinosaur no longer in the game is not counted
    Given my stored progress holds a dinosaur id the app no longer ships among 5 dug up
    When I open the home page
    Then the "DIG" tile shows 4

  Scenario: Progress that cannot be saved is still celebrated
    Given I have dug up 4 dinosaurs
    And the browser can read stored progress but not save it
    When I dig up a new one
    Then I see a new best score celebration and "5/42"
    And while the app stays open the dinosaur counts as dug up
    But after reloading the stored count is 4

  Scenario: The game works when storage cannot be read
    Given the browser cannot read stored progress
    When I dig up a dinosaur
    Then I see its name and the reveal
    And I see no count and no celebration

  Scenario: The tile and the featured card show the count
    Given I have dug up 7 dinosaurs
    Then the "DIG" tile shows 7, and so does the large card on a day it features DIG
