Feature: DIG's WHO IS IT? on a phone on its side
  On an iPhone held sideways at Explorer and Paleontologist the sand
  stands on the left and the choices stack beside it, so the child sees
  the dinosaur and every name at once.

  Scenario Outline: The question fits the window
    Given a <width> by <height> window on its side in <language>
    When the child brushes three quarters of the dinosaur at <level>
    Then the three or four choices stack on the sand's right, each at least 44 tall
    And every name fits its card, a long one on two lines
    And the sand keeps its place and size from the round's start

    Examples:
      | width | height | level          | language |
      | 568   | 320    | paleontologist | Russian  |
      | 667   | 375    | explorer       | English  |
      | 852   | 393    | paleontologist | English  |
      | 932   | 430    | explorer       | Russian  |

  Scenario: Turning mid-question
    Given the child has picked a wrong dinosaur
    When the phone turns upright and back
    Then the round, its choices and the wrong pick stay

  Scenario: A window shorter than the full screen
    Given a 568 by 212 window on its side, Safari's toolbars showing
    When the question asks with four choices
    Then each choice stays at least 44 tall
    And the choices' column scrolls on its own while the page stays still
