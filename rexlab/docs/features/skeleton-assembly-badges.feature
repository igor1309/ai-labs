Feature: Skeleton assembly: level badges
  A skeleton finished at Explorer or Paleontologist without help's last
  step, a piece moving towards its home (skeleton-assembly-help-ladder.feature),
  earns that level's badge. A badge is the level's own picture, as on the
  level switch, in a round mark. The skeleton's stand in the museum shows
  its badges, and none is ever taken away. Stars stay one per skeleton,
  the same at every level; Hatchling earns no badge.

  Background:
    Given an iPad in landscape

  Scenario: A skeleton built without the last help step earns the level's badge
    Given the level switch shows Explorer chosen
    And help's first two steps have shown while I built Triceratops
    When I fit its last piece
    Then the reveal says I earned the Explorer badge
    And the Triceratops stand in the museum shows the Explorer badge

  Scenario: One built after the last help step earns no badge
    Given the level switch shows Paleontologist chosen
    And a piece has moved towards its home while I built Stegosaurus
    When I fit its last piece
    Then the reveal earns the Stegosaurus star and no badge
    And its stand shows no badge

  Scenario: The last help step counts only once it has shown
    Given the level switch shows Explorer chosen
    And I hold Triceratops's last piece as help's last step falls due
    When I fit it, so the last step never showed
    Then the reveal says I earned the Explorer badge

  Scenario: A badge is kept after a later try with help
    Given the Triceratops stand shows the Explorer badge
    When I build Triceratops again at Explorer after a piece has moved towards its home
    Then its stand still shows the Explorer badge

  Scenario: Each level's badge is its own
    Given the Triceratops stand shows the Explorer badge
    When I build Triceratops at Paleontologist without the last help step
    Then the reveal says I earned the Paleontologist badge
    And its stand shows the Explorer badge, then the Paleontologist badge

  Scenario: Hatchling earns no badge
    Given the level switch shows Hatchling chosen
    When I build Tyrannosaurus without any help
    Then the reveal earns the Tyrannosaurus star and no badge

  Scenario: Progress kept before badges reads with none
    Given progress saved before badges with the Triceratops star
    When I open the museum
    Then the Triceratops stand shows its star and no badge
    And the next badge earned is kept beside the stars
