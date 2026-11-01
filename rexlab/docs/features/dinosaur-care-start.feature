Feature: Dinosaur care: welcoming a visitor
  A child welcomes a dinosaur, understands its needs through pictures,
  and helps it with a tap. One visit has four needs: hungry, thirsty,
  dirty, then tired. Each need is met once, with no time limit.

  Background:
    Given an iPad in landscape

  Scenario: The home page offers the care game
    When I open the home page
    Then I see a "CARE" tile with a heart symbol and a dinosaur
    And on a day COMPARE is featured it stands under the "SORT" card, the last game before "MORE COMING"
    And once I have finished a visit it shows my care best score with a trophy symbol
    When I tap "CARE"
    Then I see the care welcome screen
    And I see "NEW VISITOR" with a dinosaur symbol
    And "FRIENDS" with a heart symbol and my number of dinosaur friends
    And "HOME" with a house symbol

  Scenario: A new visitor starts a fresh visit
    Given I am on the care welcome screen
    When I tap "NEW VISITOR"
    Then a dinosaur from the shared dinosaur list visits
    But never a flying or sea reptile, to whom water and a bath mean nothing
    And I see its picture and its name in large capital letters
    And it asks for food with a picture bubble
    And I see four need symbols with the hungry symbol highlighted
    And I have 0 hearts for this visit

  Scenario: A new visitor varies without needing to be a new friend
    Given I have just finished caring for Tyrannosaurus
    When I ask for a new visitor
    Then a dinosaur other than Tyrannosaurus visits
    And it may be a dinosaur I have already befriended

  Scenario: A quick double tap starts only one visit
    Given I am on the care welcome screen
    When I tap "NEW VISITOR" twice quickly
    Then only one visit starts
    And I have 0 hearts for that visit

  Scenario Outline: Care uses the chosen language
    Given the app is in <language>
    When I open care and start a visit
    Then its controls use these words in <language>
      | control     | text          |
      | care tile   | <care>        |
      | new visitor | <new visitor> |
      | friends     | <friends>     |
      | home        | <home>        |
      | plants      | <plants>      |
      | meat        | <meat>        |
      | water       | <water>       |
      | bath        | <bath>        |
      | nest        | <nest>        |
    And the dinosaur's name is in <language>
    And every word for children is in capitals

    Examples:
      | language | care        | new visitor | friends | home  | plants   | meat | water | bath     | nest   |
      | English  | CARE        | NEW VISITOR | FRIENDS | HOME  | PLANTS   | MEAT | WATER | BATH     | NEST   |
      | Russian  | ЗАБОТА      | НОВЫЙ ГОСТЬ | ДРУЗЬЯ  | ДОМОЙ | РАСТЕНИЯ | МЯСО | ВОДА  | КУПАНИЕ  | ГНЕЗДО |

  Scenario Outline: Care stays readable in either theme
    Given the app uses the <theme> theme
    When I open care, help a visitor and open my friends
    Then all care screens use the <theme> theme
    And the active need and earned hearts are shown by symbols as well as colour

    Examples:
      | theme |
      | light |
      | dark  |
