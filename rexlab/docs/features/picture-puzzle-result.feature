Feature: Completing a dinosaur picture
  A completed picture becomes a living-color reveal, with the dinosaur's
  large name and one visible-feature fact in the chosen language.
  Facts use the project's trusted science sources.
  A level's collection score is the number of distinct dinosaurs completed
  at that level, from zero to three, independently of the shared collection.
  Round stars are immediate feedback only, not an accumulated currency.
  Choice stars mark the shared collection and do not change with level.
  The home tile and featured card show the shared distinct-dinosaur count out of 3.
  The result shows the played-level count, plus the shared collection count.
  Its first completion celebrates a first best; a larger count celebrates
  a new best. Repeating a dinosaur at that level keeps the count unchanged.

  Scenario: The last piece earns one completion
    Given one piece remains
    When I fit it and repeat its release or tap
    Then completion is recorded exactly once
    And I see the full picture, the dinosaur name and its feature fact
    And I earn one round star at every level, even on a replay
    And my collection marks that dinosaur as completed
    And with readable storage a first or larger collection best for this level is celebrated
    And the result displays the played level and its collection score out of 3
    And the shared collection across levels never loses dinosaurs
    And the result offers replay, another picture and home

  Scenario: Replaying keeps achievements
    Given I have completed a dinosaur before
    When I replay it
    Then its tray is freshly shuffled
    And completing it earns a round star without duplicating its collection entry
    And it celebrates a collection best only if that level's best grows
    And the result still displays that level's unchanged collection score out of 3

  Scenario: Progress survives a new session
    Given I have completed a dinosaur
    When I reload the app
    Then its star appears on the picture choice screen and puzzle home tile
    And its completion contributes to the featured puzzle card
    And puzzle progress never appears on catalogue or dinosaur pages
    Given saved progress is missing, malformed or storage is unavailable
    When I open and complete a puzzle
    Then I can play and see my earned star without a crash
    And unavailable storage is never presented as a verified historical best
    And the round star and completion reveal still celebrate finishing
    And no FIRST BEST or NEW BEST wording is shown

  Scenario: The same dinosaur earns independent level bests
    Given no puzzle has been completed
    When I complete Tyrannosaurus at Hatchling
    Then Hatchling has a first best of 1 and the shared collection holds 1 dinosaur
    And the result shows Hatchling 1/3
    When I complete Tyrannosaurus at Explorer
    Then Explorer has a first best of 1 and the shared collection still holds 1 dinosaur
    And the result shows Explorer 1/3
    When I complete Triceratops at Explorer
    Then Explorer celebrates a new best of 2 and the shared collection holds 2 dinosaurs
    And the result shows Explorer 2/3
    And Hatchling still has a best of 1
    When I replay Tyrannosaurus at Hatchling
    Then the result shows Hatchling 1/3 without a new-best celebration
