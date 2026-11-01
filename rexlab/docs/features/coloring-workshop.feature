@next
Feature: Coloring workshop
  Free creativity with Stegosaurus, Triceratops, Ankylosaurus and T-Rex artwork. There is no model to
  copy, time limit, coverage target or judgement of artistic quality.
  An action means one accepted brush contact from press to release, or
  one fill. A work is nonempty when its current editable paint differs
  visibly from the initial unpainted dinosaur; tool choices are not paint. Paint matching the initial base color
  alone is empty; a contact that changes no visible paint adds no undo entry.

  Scenario: Start a new work
    When I choose NEW WORK in coloring
    Then a new independent work opens with an unpainted Stegosaurus
    And I can open 12 color swatches including the unpainted base color and 3 round brush sizes
    And the current color, BRUSH, FILL, SIZE and UNDO controls are available
    And the selected color, tool and size are shown by shape as well as color
    And HOME, NEW WORK, GALLERY and DONE have symbols and localized uppercase names
    And no separate eraser, color mixing or template tasks are offered

  Scenario: Full-height tablet landscape workshop
    Given I use an iPad mini in landscape
    Then HOME, NEW WORK, GALLERY and DONE are differently colored icon-only buttons on the leading edge
    And navigation is separated from drawing tools by visible space and a divider
    And navigation is above the current color, BRUSH, FILL, SIZE and UNDO controls
    And every control has a localized accessible name and a touch target of at least 48 pixels
    And the dinosaur fills the available canvas without a paper card, workshop heading or dinosaur title
    And there is no top navigation row or bottom palette
    And the leading groups are vertically centered between the top and bottom safe areas
    And HOME has breathing room below the top safe area as well as the system inset
    And the rail stays one column wide with 48 pixel buttons on iPad mini landscape
    And short landscape viewports use the horizontal navigation and drawing controls
    And an empty idle work shows no LET’S PAINT footer or save disk
    And saving and saved status remain available to assistive technology without a bottom row
    And the canvas keeps its dimensions and coordinates across idle, saving and saved states
    And both light and dark themes keep navigation colors distinct

  Scenario: Save failures remain actionable
    Given a save fails in the workshop
    Then the failure dialog and its RETRY control are visible within the viewport
    When I choose KEEP EDITING
    Then the failure status and its RETRY control remain visible within the viewport
    And the latest paint is retained
    When I choose RETRY
    Then saving status remains accessible along with the unresolved failure until the save succeeds
    And a successful save clears the failure

  Scenario: Temporary tablet pickers
    Given I use the landscape tablet workshop
    When I open COLOR or SIZE
    Then a temporary picker appears beside the leading rail
    And the dinosaur remains visible and its canvas keeps the same dimensions and coordinates
    And the selected choice receives focus and navigation and drawing are blocked
    And keyboard focus stays in the picker
    When I select a choice, choose CLOSE or press Escape
    Then the picker closes and focus returns to its trigger
    And tool choices add no paint, undo step or save
    And choosing a size selects BRUSH

  Scenario: Rotation and shorter viewports
    Given a work has saved paint
    When I rotate the tablet or shorten its browser viewport
    Then temporary pickers close and uncommitted contacts are discarded
    And the canvas retains its saved paint and logical drawing coordinates
    And short landscape viewports use horizontal controls when the single rail cannot fit
    And portrait and short phone landscape keep controls and pickers within the safe areas
    And no control shrinks below a 48 pixel touch target or overlaps the canvas

  Scenario: A contact makes one editable stroke
    Given the brush is selected
    When I press inside the silhouette, move across it and release
    Then one continuous stroke follows my contact in the selected color and size
    And only the part inside the silhouette receives paint
    And crossing outside and back in leaves no connecting paint outside it
    And the outline and eyes remain visible above all paint
    When I tap inside the silhouette without moving
    Then one round dot is one action

  Scenario: Outside contacts and extra fingers do not damage a work
    Given a work has paint
    When I start a brush contact outside the silhouette and move inside
    Then only the path inside the silhouette receives paint
    When I make a contact entirely outside it
    Then the paint and undo history do not change
    When another finger touches during an active stroke
    Then it adds no paint and triggers no control
    And the canvas gesture does not scroll or zoom the page

  Scenario: Fill a closed region
    Given FILL and blue are selected
    When I tap inside one closed region of the dinosaur
    Then that whole region becomes blue in one undoable action
    And the fill replaces all earlier brush paint and fill inside that region
    And undo restores that region exactly as it was before the fill
    And other regions, outlines and eyes are unchanged
    When I fill that uniformly blue region blue again or tap outside the silhouette or on an outline
    Then no paint change or undo entry is added

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
    Then the workshop renders the original trex-hatchling-1 vector scene
    And a friendly large-headed T-Rex has two little two-finger arms, two powerful hind legs and a long curved tail
    And the head, body, tail and hind legs offer broad independent coloring regions
    And its eyes, smile, fingers and toes remain protected decorative details
    And a simple ground and plant frame leave the dinosaur clear and prominent
    And the entire scene fits supported iPad landscape viewports without clipping
    And the canvas has the localized uppercase accessible name T-REX or ТИРАННОЗАВР

  Scenario: Rich T-Rex prehistoric scene
    Given I start a new T-Rex work at Explorer or Paleontologist
    Then the workshop renders the original trex-explorer-1 vector scene
    And the same recognizable creature appears in a richer prehistoric landscape
    And its belly and broad body markings add independent coloring regions beyond the Hatchling version
    And prehistoric plants, rocks, clouds and distant hills offer additional broad independent coloring regions
    And small facial details, fingers, toes and plant veins remain protected rather than tiny fill targets
    And the entire scene fits supported iPad landscape viewports without clipping

  Scenario Outline: Independent T-Rex fills preserve the drawing
    Given I open a T-Rex work using <artwork>
    When I fill any enclosed animal or scenery region
    Then only that visible region changes, including when it lies inside a larger region
    And its outline, eye highlights and decorative ink remain visible above fills and brush paint
    And every coloring region has a broad visible interior rather than a hidden or hair-thin target
    And the shared palette, brush, base color and undo remain available

    Examples:
      | artwork          |
      | trex-hatchling-1 |
      | trex-explorer-1  |
