Feature: A dinosaur's page in a tall window
  In a tall window, portrait and at least 600 CSS pixels wide (an iPad
  upright, in Split View or Stage Manager, or a tall Mac window), a
  dinosaur's page stands upright: the bar at the top as in landscape,
  "ANCIENT REPTILES" at the left and the position at the right; under it
  the navy stage across the width, the picture in its middle and the ←
  and → buttons beside it, at the stage's left and right, centred on its
  height; under the stage the words, each across the width: the line
  kept for the group of a creature that is no dinosaur, the name, the
  food tag, the description, the two facts side by side, and the note
  for parents. The rest is as catalogue.feature and
  catalogue-creatures.feature tell; a turn is in
  dinosaur-page-turn.feature. A tall-narrow window keeps the picture
  asking to turn or widen (window-shape.feature).

  The page's padding, the bar, the stage's padding and rounding, the
  buttons, the food tag, the facts' cards and the words' type keep their
  landscape sizes; the stage is 32 pixels under the bar and 32 over the
  words, which are 24 apart, and the picture is 16 from each button.
  "The width" below is the words' width: the window's less its side
  insets and the padding (a scrollbar that takes room narrows it). Every
  name in one window is in the same type, 7.8% of the width and at most
  64 pixels, so the longest fits on one line with room. The line over
  the name is kept on every page, empty for a dinosaur, and the
  description keeps room for as many lines as the longest in either
  language takes at that width: three at 656 pixels or more, four at 520
  to 655, five under 520 (the narrowest, 488). So the words take the
  same height on every page of one window in either language, and the
  stage takes the height they leave. The picture, at its 4:3, is as wide
  as the width less 232 (the stage's padding and the buttons with their
  gaps) or as the stage's height less its padding allows, whichever is
  less, and the same on every page. The stage is never under 248 pixels
  tall; where the window leaves it less, the whole page scrolls. Sizes
  hold to within a pixel, the picture's to within 4.

  Scenario Outline: The page stands upright
    Given a window of <width> by <height> CSS pixels, with no safe areas and scrollbars that take no room
    When I open the page of Pachycephalosaurus
    Then I see no picture asking to turn sideways or to make the window wider
    And "ANCIENT REPTILES" stands at the top left and "10 / 52" at the top right
    And under them the stage spans the width, its picture <picture> CSS pixels, the ← and → buttons beside it
    And under the stage "PACHYCEPHALOSAURUS" stands on one line in <name>-pixel type, the food tag, the description, the facts side by side and the note under it
    And the page <scrolls> up and down

    Examples:
      | width | height | picture   | name | scrolls         | window                         |
      | 600   | 800    | 256 by 192 | 38   | scrolls         | Stage Manager, or a Mac        |
      | 744   | 1133   | 385 by 289 | 49   | does not scroll | iPad mini upright              |
      | 768   | 1024   | 292 by 219 | 51   | does not scroll | iPad 9.7" upright              |
      | 820   | 1180   | 476 by 357 | 55   | does not scroll | iPad Air upright               |
      | 1024  | 1366   | 680 by 510 | 64   | does not scroll | iPad Pro 12.9" upright         |

  Scenario Outline: Every word fits the narrowest widths
    Given the app is in <language>
    And a window of <width> by 1366 CSS pixels, with no safe areas and scrollbars that take no room
    When I open the page of each of the 52 creatures in turn
    Then its name stands on one line, none cut
    And its description takes no more than <lines> lines, its facts' values each on one line
    And the stage and the words keep the same place and size on every page

    Examples:
      | language | width | lines |
      | English  | 600   | 5     |
      | Russian  | 600   | 5     |
      | English  | 632   | 4     |
      | Russian  | 632   | 4     |
      | English  | 768   | 3     |
      | Russian  | 768   | 3     |

  Scenario: A flying reptile names its group in the line kept for it
    Given a window of 820 by 1180 CSS pixels on the page of Chasmosaurus
    When I tap the → button
    Then I see the page of Quetzalcoatlus, "FLYING REPTILE" just over its name
    And its picture, name and words stand where Chasmosaurus's did

  Scenario: A card opens its page upright
    Given a window of 820 by 1180 CSS pixels on the list of every dinosaur
    When I tap the card of Triceratops
    Then the page of Triceratops opens upright, its picture growing from the card into the stage
    And I see no picture asking to turn sideways
    When I tap the "ANCIENT REPTILES" button
    Then the picture shrinks back into the card of Triceratops, in view in the upright list

  Scenario: A tall-narrow window still shows the picture over the page
    Given a window of 820 by 1180 CSS pixels on the page of Triceratops, the device's screen upright
    When the window becomes 393 by 852 CSS pixels
    Then the picture asking to turn sideways fades in over the page

  Scenario: Safe areas stay clear upright
    Given a window of 744 by 1133 CSS pixels on a device with rounded corners and a home indicator
    When I open the page of Triceratops
    Then the bar sits under the top inset and the note above the home indicator
    And the screen's background still reaches the window's edges
