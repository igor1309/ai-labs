Feature: Sand writing: a full-screen free drawing canvas
  LAB-470 is an open sandbox, not a recognition exercise. Marks stay as
  drawn. It offers no questions, conversion, score, timer or fixed sequence.
  The same activity is available at every age level.

  Scenario: The canvas takes the whole viewport
    Given I open sand writing in portrait or landscape
    Then sand fills the available viewport including behind the controls
    And the page has no scrolling horizontally or vertically
    And an icon-only Home button is at the safe leading edge
    And a tip-size picker is at the safe trailing edge
    And no title, instructions, version footer or other controls occupy the canvas

  Scenario: A precise sand-writing tip
    Given sand writing has opened
    Then the selected tip is 4 CSS pixels across
    And the picker offers tips of 2, 4 and 8 CSS pixels across
    And every tip is smaller than DIG's smallest 36 CSS pixel brush
    When I draw a letter, number or figure with Pencil, mouse or finger
    Then a continuous rounded groove follows the pointer without gaps
    And a darker sandy groove with a light displaced lip remains as drawn
    And its width stays consistent across canvas sizes and device pixel ratios
    And the marks are neither recognized nor changed into symbols

  Scenario: Input stays on the canvas
    Given I draw with one pointer
    When another pointer touches the canvas
    Then only the active pointer draws
    And dragging, pinching and holding open no scroll, zoom or selection
    When the active pointer is cancelled or loses capture
    Then drawing stops until a new pointer begins a stroke
    And opening the picker or pressing Home creates no drawing marks
    And controls follow the shared double-tap protection

  Scenario: Clear from inside the tip picker
    Given I have drawn some marks
    When I open the tip picker and choose clear
    Then the sand is blank and the selected tip is kept
    And clear is not a separate permanent control on the canvas
    And picker options and Home have localized accessible names

  Scenario: Resizing preserves the drawing
    Given I have drawn some marks
    When the viewport resizes or turns and back
    Then the marks remain without being cleared
    And the canvas fills the new viewport with no scrolling
    And subsequent strokes still use the selected CSS pixel tip width
    And the controls remain reachable within the safe areas
