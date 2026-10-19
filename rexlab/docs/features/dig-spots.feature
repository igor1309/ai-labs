Feature: Dig: the spots of each dinosaur
  A spot is a detail on a dinosaur's body picture that Explorer finds
  and Paleontologist follows as a clue: a round place, its middle and
  radius in the picture's 800 by 600 frame, and its kind. The spots are
  data, in src/data/dig.json, with each dinosaur's cells: which of the
  40 by 30 cells of its picture lie over the dinosaur. A spot is found
  once more than half of its cells over the dinosaur are clear.

  Scenario: Every dinosaur has three to five spots
    Given the dinosaur list the app ships with
    Then every dinosaur has 3 to 5 spots in the dig data, and the data names no other dinosaur

  Scenario: A spot lies on the dinosaur and shows its detail
    Given the dig data and every dinosaur's body picture
    Then every spot lies wholly within the frame
    And at least half of its area lies over the dinosaur's picture
    And two spots of one dinosaur overlap by less than half of the smaller

  Scenario: A spot's kind is one a child can name
    Then every spot's kind is one of EYE, FOOT, TAIL, HORN, PLATE, CLAW, CREST, SAIL, FRILL or BEAK
    And one dinosaur has at most one spot of each kind

  Scenario Outline: Each kind has its words and a close-up
    Given the app is in <language>
    Then a spot's card names its kind, such as "<eye>" and "<claw>", under a round close-up of the picture cropped about the spot

    Examples:
      | language | eye  | claw   |
      | English  | EYE  | CLAW   |
      | Russian  | ГЛАЗ | КОГОТЬ |

  Scenario: The dinosaur's cells match its picture
    Given the dig data and every dinosaur's body picture
    Then a dinosaur's cell is marked as over it exactly when the picture shows in more than a tenth of the cell
