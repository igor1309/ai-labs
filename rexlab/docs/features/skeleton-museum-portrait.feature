Feature: The skeleton museum in a tall window
  In a tall window at least 600 CSS pixels wide, the museum stands
  upright. Its five stands keep their order in rows of two, the last
  centred, each at least 262 CSS pixels wide when scrollbars take no room.
  The hall scrolls when needed rather than shrinking names or exhibits.
  It has 12-pixel column gaps and no horizontal inner padding upright.
  If safe areas or a reserved scrollbar leave too little room for two
  262-pixel stands, it uses one column. Names and action sizes are checked
  by comparison with the rendered 1024 by 768 landscape museum.
  The collection, badges and rebuilding behaviour remain as specified in
  skeleton-assembly-museum.feature and skeleton-assembly-badges.feature.

  Scenario Outline: The museum stands upright
    Given a window of <width> by <height> CSS pixels without safe areas and with scrollbars that take no room
    When I open MUSEUM from home
    Then no picture asks me to turn or widen the window
    And the top row shows HOME, the museum title, the collection score always and the best score when earned
    And BUILD ANOTHER keeps its words and symbol on its own row below at every tall width
    And the five stands form rows of two, with the last centred
    And each stand has its name and, when earned, its star above its exhibit and its own button below
    And every exhibit is at least 96 CSS pixels tall and HOME, BUILD ANOTHER and every stand action are at least 44 CSS pixels tall
    And the hall scrolls vertically if needed, without horizontal scrolling

    Examples:
      | width | height |
      | 600   | 800    |
      | 744   | 1133   |
      | 820   | 1180   |
      | 1024  | 1366   |

  Scenario Outline: Words fit at the narrowest width
    Given the app is in <language> and either theme
    And a window of 600 by 800 CSS pixels without safe areas and with scrollbars that take no room
    And Tyrannosaurus is built and Triceratops is being rebuilt
    When I open MUSEUM from home
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
    When the window becomes 1180 by 820 CSS pixels
    Then the stands glide back and the hall returns to rows of three with the last two centred
    And every stand's action still starts its own puzzle

  Scenario: Safe areas leave the final action reachable
    Given a tall window at least 600 CSS pixels wide with safe areas of 24 pixels above and 20 below
    When I open MUSEUM and scroll to the end
    Then HOME is below the top inset and the last action is above the bottom inset
    And the background reaches the window edges

  Scenario: A narrow tall window keeps the gate
    Given I am in the museum in a window of 820 by 1180 CSS pixels with the device screen upright
    When the window becomes 393 by 852 CSS pixels
    Then the picture asking to turn fades in over the museum
    When the window becomes 820 by 1180 CSS pixels
    Then the picture fades out and the museum collection is unchanged

  Scenario: A fresh museum stays unearned upright
    Given a window of 600 by 800 CSS pixels and no finished skeletons
    When I open MUSEUM from home
    Then all five stands show their silhouettes without stars or badges
    And my collection score is zero and no best score is shown
