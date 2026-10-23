Feature: The skeleton museum in a tall window
  In a tall window at least 600 CSS pixels wide, the museum stands
  upright. Its five stands keep their order in rows of two, the last
  centred, each at least as wide as in the 1024 by 768 landscape museum.
  The hall scrolls when needed rather than shrinking names or exhibits.
  The collection, badges and rebuilding behaviour remain as specified in
  skeleton-assembly-museum.feature and skeleton-assembly-badges.feature.

  Scenario Outline: The museum stands upright
    Given a window of <width> by <height> CSS pixels without safe areas
    When I open MUSEUM from home
    Then no picture asks me to turn or widen the window
    And the bar shows HOME, the museum title, BUILD ANOTHER and the collection and best scores when earned
    And the five stands form rows of two, with the last centred
    And each stand has its name and earned star above its exhibit and its own button below
    And every exhibit is at least 96 CSS pixels tall and every action at least 44 CSS pixels tall
    And the hall scrolls vertically if needed, without horizontal scrolling

    Examples:
      | width | height |
      | 600   | 800    |
      | 744   | 1133   |
      | 820   | 1180   |
      | 1024  | 1366   |

  Scenario Outline: Words fit at the narrowest width
    Given the app is in <language> and either theme
    And a window of 600 by 800 CSS pixels
    And Tyrannosaurus is built and Triceratops is being rebuilt
    When I open MUSEUM
    Then every name and action fits without clipping or overlap
    And names and actions are at least as large as in the 1024 by 768 landscape museum
    And HOME shows its symbol with its accessible name
    And BUILD ANOTHER keeps its words and symbol on its own row under the title and scores
    And the rebuilding exhibit and button keep their amber dashed ring

    Examples:
      | language |
      | English  |
      | Russian  |

  Scenario: Turning keeps the collection and moves the stands smoothly
    Given I am in the museum in a window of 1180 by 820 CSS pixels
    And Tyrannosaurus is built and Triceratops is being rebuilt
    When the window becomes 820 by 1180 CSS pixels
    Then the stands glide to their upright places using the shared motion tokens
    And my stars, best score, badges and rebuilding state are unchanged
    When I turn back to landscape
    Then the hall returns to rows of three with the last two centred
    And every stand's action still starts its own puzzle

  Scenario: Safe areas leave the final action reachable
    Given a tall window at least 600 CSS pixels wide with safe areas
    When I open MUSEUM and scroll to the end
    Then HOME is below the top inset and the last action is above the bottom inset
    And the background reaches the window edges

  Scenario: A narrow tall window keeps the gate
    Given I am in the museum in a window of 820 by 1180 CSS pixels
    When the window becomes 393 by 852 CSS pixels
    Then the picture asking to turn or widen fades in over the museum
