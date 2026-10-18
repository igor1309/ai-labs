Feature: A screen never waits for its pictures
  A screen changes at once, whatever its pictures are doing
  (docs/tap-safety.md, part 5). While a picture loads, its place keeps
  the picture's own size and shimmers: a slow sweep in the colours of
  the theme shown. Once the picture has loaded and decoded, it fades in
  over 200 ms. A picture already loaded in this visit shows at once.

  A picture that fails, or is still loading after 8 seconds, shows the
  failure look: its place keeps its size, in its card's own colour, and
  the card or tile around it still shows its name. A picture that loads
  after that still fades in. A picture with a name keeps it for screen
  readers, loading, failed or shown.

  This feature covers the catalogue, the compare game and the home page;
  each other game's features bring their own when its pictures move.

  Background:
    Given an iPad in landscape

  Scenario Outline: A picture shimmers until it has loaded, then fades in
    Given the picture of <place> is still loading
    When I open <screen>
    Then I see <screen> at once, its controls working
    And the picture's place shimmers at the picture's size
    When the picture has loaded
    Then it fades in over 200 ms

    Examples:
      | place                          | screen                          |
      | Velociraptor's catalogue card  | the list of every dinosaur      |
      | Velociraptor's page            | the page of Velociraptor        |
      | a card of question 1           | question 1 of a compare round   |
      | the compare result's dinosaur  | the result of a compare round   |
      | the ALL DINOSAURS tile         | the home page                   |

  Scenario: A picture that fails shows the failure look
    Given I am on question 1 of a compare round, its pictures loading
    When a picture of question 1 fails to load
    Then its place stops shimmering and shows its card's own colour, at the picture's size
    And the card still shows its dinosaur's name and can be tapped

  Scenario: A picture still loading after 8 seconds shows the failure look, and fades in if it loads after
    Given I am on question 1 of a compare round, its pictures loading
    When 8 seconds pass
    Then each picture's place shows the failure look
    When a picture of question 1 loads
    Then it fades in over 200 ms

  Scenario: A picture already loaded shows at once
    Given the list of every dinosaur shows Velociraptor's picture
    When I tap the card of Velociraptor
    Then the page of Velociraptor shows its picture at once, without a shimmer
    And the card's picture grows into the page's picture

  Scenario: A place whose picture changes shows the new one's shimmer
    Given I am on the page of Tyrannosaurus, its picture shown
    And the picture of Triceratops is still loading
    When I tap the → button
    Then the page of Triceratops shows its picture's shimmer, not Tyrannosaurus's picture
    And if Tyrannosaurus's picture is loaded again meanwhile, nothing changes

  Scenario: The next pictures load ahead
    Given I am on the page of Velociraptor
    Then the pictures of Triceratops and Brachiosaurus have started loading
    Given I am on question 3 of a compare round
    Then the pictures of question 4 have started loading

  Scenario: A round starts once for two activations from home
    Given the large card features COMPARE
    When I tap the "COMPARE" tile and then the large card, more than 100 CSS pixels away, before the question shows
    Then one round starts, at "1/10"
    And COMPARE counts one more start

  Scenario: Reduced motion
    Given the iPad asks for reduced motion
    And the picture of Velociraptor's page is still loading
    When I open the page of Velociraptor
    Then its picture's place is a still placeholder in the theme's colours
    And when the picture has loaded it appears at once

  Scenario Outline: The shimmer in each theme
    Given the <theme> theme
    And a picture still loading
    Then its place sweeps from <from> to <to> and back, once every 1.5 seconds

    Examples:
      | theme | from    | to      |
      | light | #E6E2D9 | #FFFDF8 |
      | dark  | #222A3D | #181E2E |
