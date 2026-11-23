@next
Feature: Coloring workshop tools, undo and early creatures
  Free creativity with Stegosaurus, Triceratops, Ankylosaurus, T-Rex, Mosasaurus, Brachiosaurus, Pteranodon, Parasaurolophus and Spinosaurus artwork. There is no model to
  copy, time limit, coverage target or judgement of artistic quality.
  An action means one accepted brush contact from press to release, or
  one fill. A work is nonempty when its current editable paint differs
  visibly from the initial unpainted dinosaur; tool choices are not paint. Paint matching the initial base color
  alone is empty; a contact that changes no visible paint adds no undo entry.

  Scenario: Change tools between actions
    Given I have painted a red stroke
    When I choose blue, a larger brush and then FILL
    Then my existing paint is unchanged
    And the next action uses blue FILL
    When a control is touched during an active stroke
    Then it does not interrupt or change that stroke's color, size or tool

  Scenario: Undo the last paint change
    Given I have painted a stroke and then filled a region
    When I choose UNDO
    Then the fill is removed and the earlier stroke remains
    When I choose UNDO again
    Then the stroke is removed and DONE is unavailable on the empty work
    And UNDO is unavailable when no action remains
    And choosing colors, tools or size did not add undo steps
    And each undo is autosaved as the current editable work

  Scenario: Cancel an interrupted gesture
    Given a saved work is open
    When an active stroke is cancelled by rotation, leaving the app or a cancelled pointer
    Then its uncommitted paint is discarded
    And all previously completed actions remain
    And no reward or empty undo step is added

  Scenario: Drawing respects shared double-tap safety
    When I tap twice inside the canvas 200 ms apart at the same point
    Then only the first dot or fill changes the canvas
    When I drag an accepted stroke and press again after its release
    Then the next contact paints another dot or stroke even within 200 ms at the same place
    And the earlier accepted drag did not open a double-tap window

  Scenario: Restore the editable work
    Given I have saved a stroke, a fill and an undo
    When I close and reopen the app and resume that work
    Then its editable paint matches the last successfully saved revision
    And I can paint, fill and undo the remaining saved actions
    And its thumbnail represents that same revision

  Scenario: Painting the base color does not complete a new work
    Given a new unpainted work and a palette color matching its base
    When I paint only with that color
    Then the work remains empty, UNDO and DONE are unavailable and no draft is saved

  Scenario: The base color returns a work to empty
    Given a work contains paint
    When I cover all that paint with the base color until it matches the initial appearance
    Then DONE is unavailable just as when all paint has been undone
    And a previously saved work keeps its identity and undo history
    And a completed work keeps its completed status and single star on its empty thumbnail
    And a draft stays a draft with no star
    And UNDO restores the paint before the last base-color action

  Scenario: Triceratops uses the shared workshop
    When I choose Triceratops in the gallery
    Then friendly original vector art shows a broad frill and exactly three horns
    And thick outlines enclose large independently fillable body, frill, head, leg and horn regions
    And the complete silhouette fits landscape iPad without clipping
    And its canvas has the localized uppercase accessible name TRICERATOPS or ТРИЦЕРАТОПС
    When I fill the frill, a horn or the body
    Then only that visible region changes and the outlines and eyes remain protected
    And the shared palette, brush, base color, undo, autosave and navigation work as for Stegosaurus
    When I choose NEW WORK from this workshop
    Then another unpainted Triceratops opens without overwriting the saved work

  Scenario: A richer landscape for Explorer and Paleontologist
    Given the global level is Explorer or Paleontologist
    When I choose Triceratops in the gallery
    Then a longer-bodied Triceratops stands in a prehistoric landscape with a cycad, fern, rocky ridge, meadow and stream
    And four varied frill panels, flank, back bands, cheek, beak, three horns and four legs are independently fillable
    And the plants, sun, cloud, ridge, meadow, stream and rock also have their own enclosed fill regions
    And painting any region leaves every other region, protected eyes and outlines unchanged
    And the entire scene fits landscape iPad without clipping

  Scenario: Hatchling retains the simple artwork
    Given the global level is Hatchling
    When I choose Triceratops in the gallery
    Then the simple Triceratops with its belly and two spots opens
    And its geometry and appearance match existing simple Triceratops drawings

  Scenario: Simple T-Rex for Hatchling
    Given I start a new T-Rex work at Hatchling
    Then the workshop renders trex-hatchling-2, the original trex-hatchling-1 vector scene enlarged to fill the paper
    And a friendly large-headed T-Rex has two little two-finger arms, two powerful hind legs and a long curved tail
    And the head, body, tail and hind legs offer broad independent coloring regions
    And its eyes, smile, fingers and toes remain protected decorative details
    And a simple ground and plant frame leave the dinosaur clear and prominent
    And the entire scene fits supported iPad landscape viewports without clipping
    And the canvas has the localized uppercase accessible name T-REX or ТИРАННОЗАВР
