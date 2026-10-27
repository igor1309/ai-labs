Feature: Assembling a dinosaur picture
  Each puzzle cuts a single complete 4:3 picture into rectangular tiles.
  The existing dinosaur artwork sits on a continuous decorative background
  with distinguishable detail throughout, so transparent corners do not
  produce identical empty pieces. The artwork is not stretched.
  Slots are visible at every level; pieces never rotate.

  Scenario: A manageable tray keeps every piece available
    Given a landscape iPad mini viewport of 1133 by 744 CSS pixels
    When I play at any level
    Then the complete board and controls fit without page scrolling
    And each slot and tray piece has a touch target at least 48 by 48 CSS pixels
    And the tray shows at most four unplaced pieces at once
    And previous and next tray controls make every unplaced piece reachable
    And placed pieces leave the tray without hiding any remaining piece permanently
    And the bottom edge has room for resting wrists

  Scenario: Placing by touch or by taps
    Given I have unplaced pieces
    When I drag a tray piece
    Then a matching picture tile follows my finger without scrolling the page
    When its center is released in its home slot or within 24 CSS pixels of that slot
    Then the piece snaps into exact alignment once and stays fitted
    And a neighboring wrong slot never accepts the piece
    And only its own home bounds determine acceptance
    When I tap another tray piece and then its empty home slot
    Then it fits in the same way
    And I can also select and place using keyboard buttons

  Scenario: Wrong placement invites another try
    Given I have placed some pieces
    When I drop a piece outside its home snap area or tap another slot
    Then no additional piece is fitted
    And the piece gently returns to the tray with a visible retry reaction
    And fitted pieces and earned progress remain
    And there is no timer, penalty or failure screen

  Scenario: Guidance changes without changing rewards
    Given I play Hatchling
    Then a faint full-picture guide is visible beneath empty slots
    Given I play Explorer or Paleontologist
    Then there is no full-picture guide beneath empty slots
    When I toggle the picture preview
    Then a separate complete picture is shown without fitting any pieces
    And toggling again hides it
    When I request a hint with a piece selected
    Then its matching home is highlighted without placing it
    And hints and preview never reduce rewards

  Scenario: Touch interruption preserves the puzzle
    Given I am dragging one piece after fitting two others
    When a second pointer touches or releases on the board
    Then it cannot move or place a second piece
    When the first pointer is cancelled or capture is lost
    Then the held piece returns to the tray and both fitted pieces stay
    When the app is hidden, the game left, or the viewport changes layout
    Then the active drag is cancelled without placing it
    And no stale release may complete a puzzle

  Scenario: Smaller windows stay usable
    Given the viewport cannot fit the board at the minimum target size
    Then I see the app's widen or turn guidance
    And the puzzle behind it is not interactive
    And returning to supported landscape preserves fitted pieces
