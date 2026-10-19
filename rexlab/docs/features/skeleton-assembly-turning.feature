Feature: Skeleton assembly: turning a piece
  At Paleontologist some pieces arrive in the tray turned a quarter, half
  or three quarters (skeleton-assembly-paleontologist.feature,
  docs/skeleton-levels.md). A tap on a piece in the tray turns it a
  quarter, the way a clock's hands go; a drag still picks it up. A piece
  fits only the right way up, so the child decides how a bone sits before
  placing it. There is no two-finger turning, and nothing is ever turned
  at Hatchling or Explorer.

  Background:
    Given an iPad in landscape
    And the level switch shows Paleontologist chosen

  Scenario: Some pieces arrive turned
    When I tap Tyrannosaurus, the draw turning the skull a quarter and the tail tip half
    Then the skull and the tail tip lie turned in their spots
    And each carries a small turn mark, so it shows it can be turned
    And every other piece lies the right way up, with no mark

  Scenario: A tap turns a piece a quarter
    Given the skull lies turned a quarter
    When I tap the skull in the tray
    Then it turns a quarter more, to lie upside down, in its spot
    When I tap it twice more
    Then it lies the right way up and its turn mark is gone

  Scenario: A drag still picks a turned piece up
    Given the skull lies turned a quarter
    When I drag the skull onto the outline
    Then it is held turned as it lies, and does not turn

  Scenario: A piece fits only the right way up
    Given the skull lies turned a quarter
    When I drop the skull on its home
    Then it floats back to its spot, still turned, as a near miss does
    When I turn it the right way up and drop it on its home
    Then it fits

  Scenario: Under reduced motion a piece turns at once
    Given the device asks for reduced motion
    And the skull lies turned a quarter
    When I tap the skull in the tray
    Then it shows turned upside down at once, without spinning

  Scenario Outline: Nothing turns at the other levels
    Given the level switch shows <level> chosen
    When I tap Triceratops, whatever the draw
    Then every piece lies the right way up
    And a tap on a piece in the tray drops it where it lies, and it floats back, as today

    Examples:
      | level     |
      | Hatchling |
      | Explorer  |
