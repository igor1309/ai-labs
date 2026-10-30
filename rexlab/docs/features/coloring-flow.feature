@next
Feature: Coloring full flow and durable progress
  Coloring has only Explorer in this version. For this game all three
  global age choices explicitly use Explorer, including Hatchling; this
  is an exception to the nearest-lower-mode rule. It never changes the
  parent's saved global choice or pretends to offer unbuilt modes.

  Scenario Outline: One mode with every global age setting
    Given the global age setting is <level>
    When I enter coloring
    Then the Explorer workshop, tools, rewards and collection best are used
    And no age switch or next-level offer appears inside coloring
    And the saved global age setting remains <level>
    And other games still start according to that setting

    Examples:
      | level          |
      | Hatchling      |
      | Explorer       |
      | Paleontologist |

  Scenario: Home entry and progress
    When I open Home
    Then a drawing symbol accompanies COLOR A DINOSAUR or РАСКРАСЬ ДИНОЗАВРА
    And its tile and featured card show the number of distinct completed works
    When I open coloring and choose NEW WORK
    Then one game start is counted for that new work
    And navigating the gallery, continuing, retrying or repeating DONE adds no start
    And coloring progress appears in its own screens and Home presentations only
    And the catalogue, dinosaur pages and other games' scores are unchanged

  Scenario: Draw, close, return, finish and edit again
    Given the app has been opened online once
    When I create a work offline and release a stroke
    Then autosave starts without needing DONE
    And SAVING is shown until the editable revision is durably saved
    And SAVED appears only after success
    When I close the app after SAVED and reopen offline
    Then CONTINUE restores that draft
    When I fill a region and choose DONE
    Then completion waits for the latest revision and its reward to save successfully
    When I go HOME, return to GALLERY and edit that work
    Then all its paint is editable and completing again awards no new star

  Scenario: Ordered saves cannot roll a work back
    Given a stroke save is pending
    When I add a fill and then undo it before saving finishes
    Then the final saved revision contains the stroke without the fill
    And a late response for an older revision cannot replace newer paint or show SAVED early
    And reopening restores the last acknowledged current revision

  Scenario: Leaving while unsaved
    Given saving a changed work is pending or has failed
    When I choose HOME, GALLERY or NEW WORK
    Then navigation waits for saving and keeps the work visible
    And on failure I see RETRY and KEEP EDITING with symbols
    And KEEP EDITING stays in the workshop with all current paint
    And no navigation silently discards the unsaved revision
    When I force-close before a save succeeds
    Then reopening restores only the last successful revision
    And the app had never labelled the pending revision SAVED

  Scenario Outline: Storage trouble is visible and preserves readable works
    Given I have previously saved independent works
    When <problem>
    Then I see a visible storage warning with a retry action
    And no unreadable history is presented as a new empty collection or first best
    And no existing stored work is automatically cleared or overwritten
    And readable works can still be viewed
    And editing and completion remain unavailable until the affected work and reward history can be read safely
    And other games and the language, theme and age settings remain unchanged

    Examples:
      | problem                                      |
      | reading coloring storage fails               |
      | one work contains malformed data             |
      | coloring data has an unknown schema version  |

  Scenario: A write failure keeps the last successful revision
    Given a saved work and readable reward history
    When a stroke, fill or undo cannot be saved because storage is full or unavailable
    Then its current edit remains visible in memory with a save-error warning and RETRY
    And the previous durable work and other works remain unchanged
    And no saved confirmation or additional reward is shown
    When storage becomes writable and I choose RETRY
    Then the current editable revision and thumbnail save successfully
    And the warning clears only after success

  Scenario Outline: Child-sized screens in both languages and themes
    Given <device> in portrait or landscape, using English or Russian and light or dark theme
    When I visit the gallery, workshop and result
    Then child-facing words are uppercase with symbols or pictures
    And controls are at least 60 by 60 CSS pixels without overlapping the canvas
    And the dinosaur, palette and navigation fit without clipping or page scrolling
    And rotation keeps the work identity, committed paint, undo history and reward flag
    And screen, tool-selection and reward changes animate with shared quick motion tokens
    And reduced motion uses short fades and a still painted dinosaur instead of lively movement
    And a quick double tap navigates once and activates nothing on the destination screen

    Examples:
      | device                  |
      | iPad at 1024 by 768      |
      | iPhone at 390 by 844     |
      | small iPhone at 320 by 568 |
