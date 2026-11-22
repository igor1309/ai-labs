@next
Feature: Coloring workshop
  Free creativity with Stegosaurus, Triceratops, Ankylosaurus, T-Rex, Mosasaurus, Brachiosaurus, Pteranodon, Parasaurolophus and Spinosaurus artwork. There is no model to
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
