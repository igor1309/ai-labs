Feature: Completing a dinosaur picture
  A completed picture becomes a living-color reveal, with the dinosaur's
  large name and one visible-feature fact in the chosen language.
  Facts use the project's trusted science sources.

  Scenario: The last piece earns one completion
    Given one piece remains
    When I fit it and repeat its release or tap
    Then completion is recorded exactly once
    And I see the full picture, the dinosaur name and its feature fact
    And I earn one round star at every level, even on a replay
    And my collection marks that dinosaur as completed
    And a first collection best or a larger collection best for this level is celebrated
    And the shared collection across levels never loses dinosaurs
    And the result offers replay, another picture and home

  Scenario: Replaying keeps achievements
    Given I have completed a dinosaur before
    When I replay it
    Then its tray is freshly shuffled
    And completing it earns a round star without duplicating its collection entry
    And it celebrates a collection best only if that level's best grows

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
