@next
Feature: Coloring gallery
  The gallery belongs inside coloring. Each work has a stable independent
  identity, editable paint, thumbnail, draft or completed status and a
  remembered flag recording whether its one star has been awarded.
  This version offers no deletion or duplication of works.

  Scenario: An empty collection offers a new work
    When I enter coloring with no works
    Then the gallery shows NEW WORK with a drawing symbol
    And no work or star has been created merely by opening the gallery

  Scenario: Several independent works of one dinosaur
    Given I have a red completed work and a blue draft
    When I open GALLERY
    Then both Stegosaurus thumbnails show their own paint and status
    And completed works show their earned star while drafts do not
    When I open the blue draft and paint it green
    Then the red work and its thumbnail remain unchanged
    When I choose NEW WORK
    Then a new unpainted work opens without overwriting either work

  Scenario: Continue a completed work
    Given I open a completed work from the gallery
    When I change its paint and return to GALLERY
    Then its editable paint and thumbnail update under the same identity
    And it remains completed with the same single earned star
    And changing it creates no extra completed work or reward

  Scenario: Return to the most recent work
    Given I have several works and most recently edited a draft
    When I leave coloring and enter again
    Then the gallery offers CONTINUE for that draft with its thumbnail
    And I can instead open any other work or choose NEW WORK
    And opening an existing work does not count as a new game start

  Scenario: Gallery reflects durable changes only
    Given a work has a saved red thumbnail
    And saving its new blue paint fails
    When I open GALLERY after choosing to keep editing in this session
    Then the work visibly indicates unsaved changes and shows its current blue preview
    And no preview or status claims the blue revision is saved
    And retrying successfully updates the saved thumbnail and clears the warning
