Feature: Find the pair: the level offer on the result
  The offer of the next level (find-the-pair-level-offer.feature) is a
  card that rises in over the result once the result's own rewards have
  played. It shows the next level's picture from the age level menu, a
  question, "YES" with a tick symbol and "NOT NOW" with a cross symbol;
  while it shows, the result under it cannot be tapped.

  Background:
    Given an iPad in landscape

  Scenario: The offer shows the next level and two answers
    When the result offers the Explorer level
    Then I see 🦖, the picture of Explorer in the age level menu
    And I see "TRY THE EXPLORER LEVEL?"
    And I see "YES" with a tick symbol and "NOT NOW" with a cross symbol

  Scenario: The offer comes after the result's own rewards
    Given I have finished 2 strong Explorer boards in a row
    And my Explorer best is 16 tries
    When I finish an Explorer board in 12 tries
    Then I first see the star fly in and the new best score celebration
    And then the offer rises in over the result
    And the result's "PLAY AGAIN" and "HOME" cannot be tapped while it shows

  Scenario Outline: The offer fits and reads in either language and theme
    Given the app is in <language> and uses the <theme> theme
    When I see the offer of the <next> level on a 1024 by 768 screen
    Then the question reads "<question>" on at most two lines, with no scrolling
    And "<yes>" and "<not now>" are each on one line and at least 48 by 48 CSS pixels to tap
    And every word keeps at least 4.5:1 contrast with its background

    Examples:
      | language | theme | next           | question                         | yes | not now   |
      | English  | light | Explorer       | TRY THE EXPLORER LEVEL?          | YES | NOT NOW   |
      | English  | dark  | Paleontologist | TRY THE PALEONTOLOGIST LEVEL?    | YES | NOT NOW   |
      | Russian  | light | Paleontologist | ПОПРОБУЕМ УРОВЕНЬ ПАЛЕОНТОЛОГ?   | ДА  | НЕ СЕЙЧАС |
      | Russian  | dark  | Explorer       | ПОПРОБУЕМ УРОВЕНЬ ИССЛЕДОВАТЕЛЬ? | ДА  | НЕ СЕЙЧАС |

  Scenario Outline: The offer moves in and out
    Given the device <motion>
    When the offer comes and I answer it
    Then it rises in and fades out <how>

    Examples:
      | motion                          | how                           |
      | does not ask for reduced motion | with the shared motion tokens |
      | asks for reduced motion         | as short fades only           |

  Scenario: A quick double tap answers once
    Given I see the offer of the Explorer level on a Hatchling result
    When I double tap "YES" quickly
    Then the offer is answered once
    And the second tap presses nothing on the result under it

