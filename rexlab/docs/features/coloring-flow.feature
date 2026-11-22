@next
Feature: Coloring full flow and durable progress
  Coloring keeps one shared collection, tools and Explorer collection best.
  The global age setting chooses each creature’s artwork for new gallery
  selections; saved works always keep their original geometry.

  Scenario Outline: New artwork follows the global age setting
    Given the global age setting is <level>
    When I enter coloring
    Then the gallery offers Stegosaurus and exactly one Triceratops choice
    And choosing Triceratops opens <artwork>
    And the shared workshop, tools, rewards and collection best are used
    And no age switch or next-level offer appears inside coloring
    And the saved global age setting remains <level>
    And other games still start according to that setting

    Examples:
      | level          | artwork                              |
      | Hatchling      | the simple Triceratops               |
      | Explorer       | the richer Triceratops landscape     |
      | Paleontologist | the richer Triceratops landscape     |

  Scenario: Home entry and progress
    When I open Home
    Then a drawing symbol accompanies COLOR or РАСКРАСЬ on the small tile
    And on a day coloring is featured its full-title card shows the number of distinct completed works
    And on a day another game is featured its small tile shows no badge
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
    And on failure the shared save-error panel offers RETRY, KEEP EDITING and HOME WITHOUT SAVING with symbols
    And KEEP EDITING stays in the workshop with all current paint
    And HOME WITHOUT SAVING asks for confirmation that current changes will be lost
    And cancelling that confirmation retains my paint in the workshop
    And confirming returns HOME and restores only the last durable revision for that work
    And a never-saved new work is dropped only after that confirmation
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
    And unreadable works stay read-only with HOME available and are never mistaken for empty new works
    And if reward history is unreadable all coloring editing and completion stay disabled with a parent recovery action available
    And if reward history is readable, readable works remain editable and NEW WORK remains available with new unique identities
    And successful retry restores existing flags and counts without awarding any star or best celebration merely for reading them
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
