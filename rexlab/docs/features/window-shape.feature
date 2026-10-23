Feature: The window's shape
  RexLab lays out by the window's shape and size, not by the device: an
  iPad, an iPhone, a Mac window, an iPad in Split View or Stage Manager.
  Each screen that has a layout for the window's shape shows it. A screen
  with no layout yet for a portrait window shows a picture asking to turn
  sideways when the device's screen is upright, and to make the window
  wider when the screen is already sideways (Split View, Stage Manager, a
  Mac); the screen keeps its place behind it (LAB-325, LAB-326). A
  browser that cannot tell whether the device's screen is upright counts
  it as upright when the window is portrait.

  The window is in one of four size classes, a square window counting as
  portrait:
    | class       | window                                   | for example        |
    | wide        | landscape, at least 600 CSS pixels tall  | iPad, Mac          |
    | wide-short  | landscape, under 600 CSS pixels tall     | iPhone landscape   |
    | tall        | portrait, at least 600 CSS pixels wide   | iPad portrait      |
    | tall-narrow | portrait, under 600 CSS pixels wide      | iPhone portrait    |
  Until a screen's own stage builds them, a wide-short window shows the
  wide layout, and a tall-narrow window the picture a tall one shows for
  a screen with no portrait layout. A portrait layout is built for one
  size class at a time: the home page, the catalogue's list, a
  dinosaur's page, the compare quiz's question and result, and find the
  pair's welcome, board and result and sort's board have one for a tall
  window only
  (home-portrait.feature, catalogue-portrait.feature,
  dinosaur-page-portrait.feature, compare-dinosaurs-portrait.feature,
  compare-dinosaurs-result-portrait.feature,
  find-the-pair-welcome-portrait.feature,
  find-the-pair-board-portrait.feature,
  find-the-pair-result-portrait.feature,
  sort-dinosaurs-board-portrait.feature), so a tall-narrow window
  still shows the picture over them. The scenarios
  below use the care welcome screen, which has no portrait layout yet.

  Scenario Outline: The size class follows the window
    Given a window of <width> by <height> CSS pixels
    When the app opens
    Then the page's root element names its size class, <class>
    When the window becomes <new width> by <new height>
    Then the page's root element names its size class, <new class>, on the same screen and in the same state

    Examples:
      | width | height | class       | new width | new height | new class   |
      | 1180  | 820    | wide        | 820       | 1180       | tall        |
      | 1440  | 900    | wide        | 1440      | 560        | wide-short  |
      | 852   | 393    | wide-short  | 393       | 852        | tall-narrow |
      | 600   | 900    | tall        | 599       | 900        | tall-narrow |
      | 900   | 800    | wide        | 800       | 800        | tall        |
      | 1000  | 600    | wide        | 1000      | 599        | wide-short  |

  Scenario Outline: An upright screen is asked to turn sideways
    Given the app is in <language> on the care welcome screen
    When the device's screen turns upright, and the window with it
    Then I see a picture of a screen turning from upright to sideways, with "<turn>"
    And under it a small, faded footnote for parents in normal case: "<footnote>"
    When the device's screen turns back to landscape
    Then I am on the care welcome screen again

    Examples:
      | language | turn          | footnote                                          |
      | English  | TURN SIDEWAYS | A portrait layout for this screen is on its way.  |
      | Russian  | ПОВЕРНИ БОКОМ | Вертикальный вид этого экрана уже в пути.         |

  Scenario Outline: A portrait window on a sideways screen is asked to be wider
    Given the app is in <language> on the care welcome screen
    And the device's screen is sideways, as an iPad in landscape or a Mac
    When the app's window becomes <width> by <height> CSS pixels
    Then I see a picture of a window growing wider, with "<wider>"
    And under it the same footnote for parents: "<footnote>"
    When the window becomes 1200 by 800 CSS pixels
    Then I am on the care welcome screen again

    Examples:
      | language | width | height | wider                 | footnote                                         |
      | English  | 590   | 820    | MAKE THE WINDOW WIDER | A portrait layout for this screen is on its way. |
      | Russian  | 700   | 900    | СДЕЛАЙ ОКНО ШИРЕ      | Вертикальный вид этого экрана уже в пути.        |

  Scenario: The picture covers the screen and comes and goes smoothly
    Given I am on the care welcome screen
    When the window becomes portrait
    Then the picture fades in over the screen with the shared motion tokens, and covers it fully once shown
    And nothing behind it can be tapped or reached by keyboard
    When the window becomes landscape again
    Then the picture fades out and the care welcome screen is as it was

  Scenario Outline: A screen shows its portrait layout only in the size class it is built for
    Given I am on the home page
    And the device's screen is upright
    When the window becomes <width> by <height> CSS pixels
    Then <shown>

    Examples:
      | width | height | shown                                                                   |
      | 820   | 1180   | the home page shows its upright layout, with no picture asking to turn |
      | 393   | 852    | I see the picture asking to turn sideways                               |
