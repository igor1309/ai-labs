Feature: Skeleton assembly: no-fail help
  After about ten seconds without fitting a piece, one correct slot
  glows to invite the next move. Help never places a piece for the child
  or reduces the reward. There is no time limit or attempt limit. This is
  Hatchling's help; Explorer and Paleontologist help in steps instead
  (skeleton-assembly-help-ladder.feature).

  Background:
    Given an iPad in landscape
    And the level switch shows Hatchling chosen
    And a skeleton puzzle is in progress

  Scenario: Waiting offers a matching piece and slot
    Given no bone has been fitted in the last 9 seconds
    Then no automatic hint is showing yet
    When another second passes without a successful placement
    Then one unfilled slot glows gently
    And its matching tray piece is highlighted with the same visual cue
    And the hint can be understood without reading
    And no piece is placed automatically

  Scenario: Unsuccessful attempts do not keep postponing help
    Given no bone has been fitted in the last 8 seconds
    When I make unsuccessful drops for another 2 seconds
    Then a matching unplaced piece and slot are highlighted
    And the fitted pieces are unchanged

  Scenario: A hint waits for a drag to finish
    Given I have been dragging a piece for 10 seconds without fitting it
    Then no new hint flashes or moves the piece under my finger
    When I release it outside its correct snap area
    Then the piece returns to the tray and a matching piece and slot are highlighted

  Scenario: A successful placement starts a fresh help interval
    Given at least two pieces are unplaced and a hint is showing
    When I fit any unplaced piece correctly
    Then the hint clears
    And no new hint appears for another 10 seconds without a successful placement
    And the next hint refers only to a piece that is still unplaced

  Scenario: Time away from the active puzzle does not count towards help
    Given I have waited 4 seconds without fitting a piece
    When the app is hidden or the iPad is in portrait for a minute
    And I return to the puzzle in landscape
    Then my pieces are unchanged
    And a hint appears after another 6 active seconds without a successful placement

  Scenario: Any number of attempts and hints still earns the full reward
    Given I have waited five minutes, made many unsuccessful drops and used hints
    When I fit the remaining pieces
    Then I receive the same reveal and completion reward as a puzzle finished without help
    And I see no time penalty, failed attempt count or failure screen
