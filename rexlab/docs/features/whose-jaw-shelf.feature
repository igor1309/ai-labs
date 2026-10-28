Feature: A museum shelf for collected jaws
  The same collection is available at every age level in English and Russian.

  Scenario: Sixteen places on wooden shelves
    When I open JAW SHELF from the welcome, result or home museum
    Then four rows of four places show all sixteen jaw animals
    And the shelves have plant or meat pictures and labels
    And the collection count shows how many jaws I have won
    And a won jaw has its picture and capitalized dinosaur name
    And an unwon place has a faint jaw silhouette and a question mark
    And unwon places cannot open a card
    And visiting the shelf does not start a round or award progress

  Scenario Outline: Every successful jaw joins the collection immediately
    Given I play at <level>
    When I choose a wrong dinosaur
    Then no jaw is added to the shelf
    When I place the jaw correctly and leave before finishing the round
    Then that jaw is unlocked on the shelf
    And it stays unlocked after reload and at other levels
    And collecting it again does not add another slot
    Examples:
      | level          |
      | Hatchling      |
      | Explorer       |
      | Paleontologist |

  Scenario: Inspect a collected jaw
    When I tap or keyboard-activate a collected jaw
    Then its card rises with the dinosaur picture, capitalized name, diet picture and one-line jaw fact
    And its name and short fact are spoken together in my language after both pictures settle
    And its jaw chomps twice with its own sound pitch
    And keyboard focus stays inside the card
    When I tap inside the card
    Then it stays open
    When I tap outside, choose BACK or press Escape
    Then the card fades away and focus returns to its shelf place
    And speech and sound stop
    And shelf actions stay blocked until the card has left

  Scenario: Loading, leaving and reduced motion
    Given jaw or dinosaur pictures are loading or have failed
    Then shelf places keep their size and navigation and collected cards remain usable
    And chomp motion waits for both pictures to decode
    And speech and sound wait until each picture has loaded or shown its failure look
    And closing a loading card prevents late pictures from starting media
    When I leave the shelf or the orientation gate covers a card
    Then its speech, sound and dismissal timer stop
    And a late dismissal callback cannot affect another visit
    When reduced motion is requested
    Then shelves and cards arrive and leave with short fades
    And a jaw fades instead of chomping
