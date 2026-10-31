@next
Feature: Coloring gallery
  The gallery belongs inside coloring. Each work has a stable independent
  identity, editable paint, ordered undo history, thumbnail, draft or
  completed status and a
  remembered flag recording whether its one star has been awarded.
  Normal play offers no deletion or duplication of works; a parent can
  explicitly reset globally unreadable coloring history after a loss warning.
  Undo history belongs to each work and survives switching works, reopening
  completed works, app restarts and rotation; DONE does not clear it.

  Scenario: An empty collection offers a new work
    When I enter coloring with no works
    Then the gallery offers Stegosaurus and Triceratops with matching vector previews and localized uppercase names
    And NEW WORK starts an independent Stegosaurus while choosing TRICERATOPS starts an independent Triceratops
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
    And if the most recent saved edit was to a completed work, CONTINUE opens that work instead
    And with no saved works CONTINUE is absent

  Scenario: Gallery reflects durable changes only
    Given a work has a saved red thumbnail
    And saving its new blue paint fails
    When I choose GALLERY
    Then I stay in the workshop with the blue paint and a save-error warning
    When I retry successfully and choose GALLERY
    Then the gallery shows the saved blue thumbnail without an unsaved warning

  Scenario: An untouched new work does not fill the gallery
    Given I choose NEW WORK
    When I leave without making a visible paint change
    Then no empty work is saved or listed and CONTINUE still offers the previous saved work if any
    And the game start already counted is retained
    When I make the first visible paint change in a new work and saving succeeds
    Then that work is saved as an independent draft and becomes the CONTINUE work
    When I later undo all paint in that saved draft and saving succeeds
    Then it remains an editable empty draft in the gallery under the same identity
    And it cannot be completed until nonempty again

  Scenario: A completed work is undone to empty
    Given a completed work has been undone to its initial unpainted appearance and saved
    When I open GALLERY
    Then its thumbnail shows that empty appearance with completed status and its existing star
    And opening it allows more painting but DONE stays unavailable until nonempty


  Scenario: Independent works of both creatures
    Given I have a saved Stegosaurus work from before Triceratops was available
    When I choose TRICERATOPS or ТРИЦЕРАТОПС in the gallery
    Then an unpainted Triceratops opens under a new identity
    And the existing Stegosaurus paint, undo history and reward flag remain unchanged
    When I paint the Triceratops and return to the gallery
    Then each saved thumbnail and its accessible name match its own creature
    And CONTINUE restores the latest work with its own artwork
