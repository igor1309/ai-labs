Feature: Dig: the spots of each dinosaur
  A spot is a detail on a dinosaur's body picture that help shows
  through the sand and a find celebrates (dig-help.feature), and whose
  kinds tell look-alikes (dig-question.feature): a round place, its middle and
  radius in the picture's 800 by 600 frame, and its kind. The picture
  is cut into 40 by 30 cells of 20 by 20; a cell is the dinosaur's when
  its picture shows in more than a tenth of it. A spot's cells are the
  dinosaur's cells whose middle lies in its circle, and a spot is found
  once more than half of them are clear (dig-brush.feature). EYE, FOOT,
  TAIL and CLAW are details every dinosaur shows; HORN, PLATE, CREST,
  SAIL, FRILL and BEAK are telling kinds, which some show and others do
  not. Each dinosaur's telling traits are the telling kinds its picture
  shows, whether or not one is among its spots. The spots, cells and
  traits are data, in src/data/dig.json, made with the dig game's first
  slice (LAB-341, LAB-342).

  Scenario: Every dinosaur has three to five spots
    Given the dinosaur list the app ships with
    Then every dinosaur has 3 to 5 spots in the dig data, and the data names no other dinosaur

  Scenario: A spot lies on the dinosaur and can be found
    Given the dig data and every dinosaur's body picture
    Then every spot lies wholly within the frame, with a radius of 40 to 90
    And at least 4 of the dinosaur's cells have their middle in it
    And two spots of one dinosaur share less than half of the smaller's cells

  Scenario: A spot's kind is one a child can name
    Then every spot's kind is one of EYE, FOOT, TAIL, CLAW, HORN, PLATE, CREST, SAIL, FRILL or BEAK
    And one dinosaur has at most one spot of each kind
    And every telling kind among a dinosaur's spots is among its telling traits

  Scenario: A dinosaur's telling traits are what its picture shows
    Given a preview sheet of every dinosaur, its spots circled and its telling traits listed
    Then a reviewer sees each listed trait in the picture, and no telling kind the picture shows left off the list

  Scenario: The dinosaur's cells match its picture
    Given the dig data and every dinosaur's body picture
    Then a dinosaur's cell is marked as its own exactly when the picture shows in more than a tenth of it
