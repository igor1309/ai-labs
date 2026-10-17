Feature: Find the pair: starting a board
  A memory game: the child turns over cards two at a time to find
  matching dinosaur pairs, with no timer and no move limit. Levels grow
  from a few pairs of the same picture to more pairs where a picture
  matches its dinosaur's silhouette.

  Background:
    Given an iPad in landscape

  Scenario: The home page offers the game
    When I open the home page
    Then I see a "FIND THE PAIR" tile with a two-cards symbol and a dinosaur
    And it is in the third column, under the "SORT" card and as tall
    And its title sits beside its symbol, on two lines at most
    And once I have finished a board it shows my stars with a star symbol
    When I tap "FIND THE PAIR"
    Then I see the find-the-pair welcome screen
    And I see "PLAY" with a play symbol and my level as a number with a ladder symbol
    And my stars as a number with a star symbol
    And "HOME" with a house symbol

  Scenario Outline: Each level has its own board
    Given I am on level <level>
    When I tap "PLAY"
    Then I see <pairs> pairs of face-down cards in <rows> rows of <columns>
    And every face-down card shows the same footprints symbol
    And each pair matches <match>
    And every card is at least 150 by 150 CSS pixels

    Examples:
      | level | pairs | rows | columns | match                         |
      | 1     | 3     | 2    | 3       | a picture to the same picture |
      | 2     | 4     | 2    | 4       | a picture to the same picture |
      | 3     | 4     | 2    | 4       | a picture to its silhouette   |
      | 4     | 6     | 3    | 4       | a picture to its silhouette   |

  Scenario: A board's dinosaurs are different and shuffled
    When a board is dealt
    Then its pairs are of different dinosaurs from the shared dinosaur list
    And its cards are in a random order
    And two boards in a row do not deal the same dinosaurs

  Scenario: A silhouette board never deals look-alikes
    When a board of pictures and silhouettes is dealt
    Then no two of its dinosaurs are from the same look-alike group
    And every dinosaur in the shared list belongs to exactly one look-alike group

  Scenario: A board waits briefly for its pictures
    Given the pictures of the next board are still loading
    When I tap "PLAY"
    Then the welcome screen stays until the pictures load, for at most a second
    And then the board appears, its cards dealt one after the other

  Scenario: A quick double tap deals one board
    Given I am on the find-the-pair welcome screen
    When I tap "PLAY" twice quickly
    Then one board is dealt

  Scenario Outline: The game uses the chosen language
    Given the app is in <language>
    When I open find the pair and finish a board
    Then its words are in <language>
      | control    | text    |
      | game tile  | <game>  |
      | play       | <play>  |
      | home       | <home>  |
      | play again | <again> |
    And the dinosaur names are in <language>
    And every word for children is in capitals

    Examples:
      | language | game          | play   | home  | again      |
      | English  | FIND THE PAIR | PLAY   | HOME  | PLAY AGAIN |
      | Russian  | НАЙДИ ПАРУ    | ИГРАТЬ | ДОМОЙ | ЕЩЁ РАЗ    |

  Scenario Outline: The game stays readable in either theme
    Given the app uses the <theme> theme
    When I open find the pair and play a board
    Then the welcome screen, the board and the result use the <theme> theme
    And face-down cards, open cards and silhouettes stand out from the background

    Examples:
      | theme |
      | light |
      | dark  |
