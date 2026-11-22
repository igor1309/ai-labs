@next
Feature: Coloring screens, damaged storage and saved geometry
  Coloring keeps one shared collection, tools and Explorer collection best.
  The global age setting chooses each creature’s artwork for new gallery
  selections; saved works always keep their original geometry.

  Scenario Outline: Child-sized screens in both languages and themes
    Given <device> in portrait or landscape, using English or Russian and light or dark theme
    When I visit the gallery, workshop and result
    Then child-facing words are uppercase with symbols or pictures
    And visible controls are at least 60 by 60 CSS pixels without overlapping the canvas
    And the dinosaur and compact navigation fit without clipping or page scrolling
    And on small screens color and brush-size buttons open a separate chooser sheet
    And the sheet temporarily replaces the canvas area with a wrapping grid of the 12 colors or 3 sizes
    And choosing an option or CLOSE returns to the unchanged canvas with that option selected
    And the full palette need not be visible alongside the canvas
    And rotation keeps the work identity, committed paint, undo history and reward flag
    And screen, tool-selection and reward changes animate with shared quick motion tokens
    And reduced motion uses short fades and a still painted dinosaur instead of lively movement
    And a quick double tap navigates once and activates nothing on the destination screen

    Examples:
      | device                  |
      | iPad at 1024 by 768      |
      | iPhone at 390 by 844     |
      | small iPhone at 320 by 568 |

  Scenario: A parent can recover permanently unreadable coloring storage
    Given the shared coloring reward history is malformed or unsupported and cannot be restored by RETRY
    When a parent opens recovery
    Then a normal-case parent warning explains that resetting loses all coloring works and earned coloring stars on this device
    And CANCEL returns to the read-only gallery without changing any stored data
    When the parent explicitly confirms RESET COLORING and the reset saves successfully
    Then coloring starts with an empty collection and new work identities
    And other games, language, theme and age settings are retained
    And a reset creates no star or best celebration
    And the first saved nonempty completion in this explicitly reset collection shows FIRST BEST with a count of 1
    And subsequent new completed works show NEW BEST with the current collection count
    And no pre-reset best is retained or compared
    When the confirmed reset cannot be saved
    Then the original stored data remains intact and the recovery error is visible
    And coloring remains read-only with HOME available

  Scenario: One damaged work does not erase healthy works
    Given reward history and two works are readable but a third work is malformed
    When I open GALLERY
    Then the damaged work has an unavailable placeholder and RETRY instead of an editable thumbnail
    And the two healthy works can be opened, edited and completed under their existing reward flags
    And NEW WORK creates a new independent identity and never reuses the damaged one's identity
    And the damaged work's recorded completion and star still count exactly once if reward history marks it completed
    And no reset is required to continue coloring the healthy or new works

  Scenario: Saved geometry remains compatible when another creature is added
    Given an existing saved work uses geometry stegosaurus-production-1
    When I reopen coloring after Triceratops becomes available
    Then the work retains its original Stegosaurus geometry, paint, undo history and earned star
    And new gallery Triceratops works use triceratops-production-1 at Hatchling or triceratops-explorer-1 at Explorer and Paleontologist in the same collection
    When I save and reopen works of either creature
    Then each geometry version selects its own renderer and region validation
    And unknown geometry versions stay unavailable instead of being interpreted as another creature
    When a parent confirms RESET COLORING
    Then saved works and earned coloring stars for both creatures are reset together

  Scenario: Switching age preserves every saved drawing
    Given I saved a simple Triceratops at Hatchling and a richer Triceratops scene at Explorer
    When I select any global age level and reopen either saved drawing
    Then its original geometry, paint, undo history, thumbnail, localized name and earned star are retained
    And completing it again awards no additional star
    And NEW WORK from that drawing starts the same artwork under a fresh identity
    And returning to the gallery offers the Triceratops chosen by the current global age level

  Scenario Outline: T-Rex age variants and saved drawings
    Given the global age setting is <level>
    When I choose T-Rex from the coloring gallery
    Then the workshop opens <geometry> with matching preview and localized name
    And Hatchling has a simple ground and plant frame while Explorer and Paleontologist add independently fillable belly, broad markings and richer plants, rocks, clouds and hills
    And broad enclosed regions color independently while outlines and small decorative details remain protected
    And brush, fill, undo, save, completion rewards and navigation use the shared coloring behavior
    When I paint, save and reopen this work after changing the global age setting
    Then its original geometry, paint, undo history, thumbnail and earned star are retained
    And completing the reopened work again awards no additional star
    And NEW WORK from the workshop or result keeps that saved geometry under a fresh identity
    And returning to the gallery offers the T-Rex for the current global age level
    And existing creatures and their saved works remain unchanged
    And both versions fit supported iPad landscape layouts

    Examples:
      | level          | geometry                |
      | Hatchling      | trex-hatchling-1         |
      | Explorer       | trex-explorer-3          |
      | Paleontologist | trex-explorer-3          |
