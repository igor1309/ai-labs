Feature: The window's shape
  RexLab lays out by the window's shape and size, not by the device: an
  iPad, an iPhone, a Mac window, an iPad in Split View or Stage Manager.
  Each screen that has a layout for the shape shows it. A screen that has
  none yet for a portrait window shows a picture asking to turn sideways,
  or, on a window that cannot turn, to make it wider; the game keeps its
  place, and turning back resumes it (LAB-325, LAB-326).

  The window is in one of four size classes:
    | class       | window                                   | for example        |
    | wide        | landscape, at least 600 CSS pixels tall  | iPad, Mac          |
    | wide-short  | landscape, under 600 CSS pixels tall     | iPhone landscape   |
    | tall        | portrait, at least 600 CSS pixels wide   | iPad portrait      |
    | tall-narrow | portrait, under 600 CSS pixels wide      | iPhone portrait    |

  Scenario Outline: The size class follows the window
    Given a window of <width> by <height> CSS pixels
    When the app opens
    Then the app is laid out as <class>
    When the window becomes <new width> by <new height>
    Then the app is laid out as <new class>, on the same screen and in the same state

    Examples:
      | width | height | class       | new width | new height | new class   |
      | 1180  | 820    | wide        | 820       | 1180       | tall        |
      | 1440  | 900    | wide        | 1440      | 560        | wide-short  |
      | 852   | 393    | wide-short  | 393       | 852        | tall-narrow |
      | 600   | 900    | tall        | 599       | 900        | tall-narrow |

  Scenario Outline: A screen with no portrait layout yet asks to turn sideways
    Given a device whose screen can turn, in <language>
    And I am on question 3 of a compare round
    When the window turns to portrait
    Then I see a picture of a screen turning from upright to sideways, with "<turn>"
    And under it a small, faded footnote for parents in normal case: "<footnote>"
    And the picture never names a device
    When the window turns back to landscape
    Then I am on question 3 again

    Examples:
      | language | turn            | footnote                                         |
      | English  | TURN SIDEWAYS   | Portrait is on its way for this game.            |
      | Russian  | ПОВЕРНИ БОКОМ   | Вертикальный экран для этой игры уже в пути.     |

  Scenario Outline: A window that cannot turn asks to be made wider
    Given a window that cannot turn, as on a Mac with no touch screen, in <language>
    And I am on question 3 of a compare round
    When the window becomes 700 by 900 CSS pixels
    Then I see a picture of a window growing wider, with "<wider>"
    And under it the same footnote for parents: "<footnote>"
    When the window becomes 1200 by 800 CSS pixels
    Then I am on question 3 again

    Examples:
      | language | wider                | footnote                                     |
      | English  | MAKE THE WINDOW WIDER | Portrait is on its way for this game.        |
      | Russian  | СДЕЛАЙ ОКНО ШИРЕ      | Вертикальный экран для этой игры уже в пути. |

  Scenario: A screen with a portrait layout shows it
    Given a screen whose portrait layout is built
    When the window turns to portrait
    Then that screen shows its portrait layout, with no picture asking to turn

  Scenario: Turning animates
    Given a screen with a layout in both shapes
    When the window turns
    Then the screen reflows with the shared motion tokens, never a jump
    And with reduced motion it only fades
