Feature: The catalogue, compare and home never wait for their pictures
  These screens change at once, whatever their pictures are doing
  (docs/tap-safety.md, part 5); the other games follow. While a picture
  loads, its place keeps the picture's own size and shimmers: its colour
  pulses slowly in place, in the colours of the theme shown. Once the
  picture has loaded and decoded, it fades in over the --motion-picture
  token, 200 ms. A picture loaded since the app was opened shows at once.

  A picture that fails, or is still loading 8 seconds after its place
  first showed it, shows the failure look: its place keeps its size, in
  the colour of what holds it, with a footprints symbol at its centre,
  and a card or tile around it still shows its name. A picture that
  loads after that still fades in. A picture that failed is loaded again
  when a screen shown later asks for it. A picture with a name keeps it
  for screen readers, loading, failed or shown.

  It covers every picture of the catalogue, the compare game, the home
  page and a round's result, which sorting shares.

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

  Scenario Outline: A picture that fails shows the failure look
    Given the picture of <place> fails to load
    When I open <screen>
    Then its place shows a footprints symbol on <colour>, at the picture's size
    And every control of the screen still works

    Examples:
      | place                         | screen                        | colour              |
      | a card of question 1          | question 1 of a compare round | the card's colour   |
      | Velociraptor's page           | the page of Velociraptor      | the page's colour   |
      | the compare result's dinosaur | the result of a compare round | the screen's colour |

  Scenario: A picture still loading after 8 seconds shows the failure look, and fades in if it loads after
    Given I am on question 1 of a compare round, its pictures loading
    When 8 seconds pass
    Then each picture's place shows the failure look
    And each picture keeps its dinosaur's name for screen readers, as while loading
    And each card still shows its dinosaur's name and can be tapped
    When a picture of question 1 loads
    Then it fades in over 200 ms

  Scenario: A picture that failed is loaded again on a later screen
    Given the picture of Velociraptor failed to load on its catalogue card
    When I tap the card of Velociraptor
    Then the picture of Velociraptor starts loading again
    And its page's picture shimmers until it loads, then fades in

  Scenario: A picture already loaded shows at once
    Given the list of every dinosaur shows Velociraptor's picture
    When I tap the card of Velociraptor
    Then the page of Velociraptor shows its picture at once, without a shimmer
    And the card's picture grows into the page's picture

  Scenario Outline: A place whose picture changes shows only the new one
    Given I am on the page of Tyrannosaurus, its picture <before>
    And the picture of Triceratops is still loading
    When I tap the → button
    Then the page of Triceratops shows its picture's shimmer, not Tyrannosaurus's picture
    When Tyrannosaurus's picture <after>
    Then the page of Triceratops still shows its picture's shimmer

    Examples:
      | before        | after                                            |
      | shown         | is loaded ahead again as Triceratops's neighbour |
      | still loading | finishes loading                                 |

  Scenario: Reduced motion
    Given the iPad asks for reduced motion
    And the picture of Velociraptor's page is still loading
    When I open the page of Velociraptor
    Then its picture's place stands still in the first colour of its sweep
    And when the picture has loaded it fades in over 200 ms

  Scenario Outline: The shimmer in each theme
    Given the <theme> theme
    And a picture still loading
    Then its place's colour pulses from <from> to <to> and back, once every 1.5 seconds

    Examples:
      | theme | from    | to      |
      | light | #E6E2D9 | #FFFDF8 |
      | dark  | #222A3D | #181E2E |
