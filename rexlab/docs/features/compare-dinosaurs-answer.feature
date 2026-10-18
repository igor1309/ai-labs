Feature: Compare dinosaurs quiz: answering a question
  Answering takes one tap; the answer and both values are then shown,
  and "NEXT" moves on.

  Background:
    Given an iPad in landscape
    And a round of the compare dinosaurs quiz is in progress

  Scenario Outline: A correct answer
    Given the question "<prompt>" about <larger> and <smaller>
    When I tap <larger>
    Then <larger> is marked correct with a ✓
    And both cards show their <attribute>
    And the answer counts as correct
    And a "NEXT" button with a ▶ symbol appears

    Examples:
      | prompt          | attribute | larger        | smaller      |
      | WHO IS HEAVIER? | mass      | Triceratops   | Velociraptor |
      | WHO IS TALLER?  | height    | Brachiosaurus | Stegosaurus  |

  Scenario Outline: A wrong answer shows the right one
    Given the question "<prompt>" about <larger> and <smaller>
    When I tap <smaller>
    Then <smaller> is marked wrong with a ✗
    And <larger> is marked as the right answer with a ✓
    And both cards show their <attribute>
    And the answer counts as wrong
    And a "NEXT" button appears

    Examples:
      | prompt          | attribute | larger        | smaller      |
      | WHO IS HEAVIER? | mass      | Triceratops   | Velociraptor |
      | WHO IS TALLER?  | height    | Brachiosaurus | Stegosaurus  |

  Scenario: A dinosaur card shows it is pressed
    When I press a dinosaur card
    Then the card shows a pressed state before its mark appears

  Scenario: Marks do not rely on colour alone
    When I answer a question
    Then each mark is a symbol as well as a colour
    And each mark has a contrast ratio of at least 3:1 with its card

  Scenario: Only the first tap counts
    Given I have answered the current question
    When I tap either dinosaur card again
    Then nothing changes

  Scenario Outline: Values are written plainly
    When a <attribute> of <value> is revealed
    Then it reads "<text>"

    Examples:
      | attribute | value   | text   |
      | mass      | 15 kg   | 15 KG  |
      | mass      | 14.6 kg | 15 KG  |
      | mass      | 999 kg  | 999 KG |
      | mass      | 1000 kg | 1 T    |
      | mass      | 6543 kg | 6.5 T  |
      | mass      | 6500 kg | 6.5 T  |
      | mass      | 7000 kg | 7 T    |
      | height    | 3 m     | 3 M    |
      | height    | 0.5 m   | 0.5 M  |
      | height    | 12.26 m | 12.3 M |

  Scenario: Next moves to the following question
    Given I have answered question 3
    When I tap "NEXT"
    Then I see the progress "4/10"
    And the new question shows no values yet

  Scenario: The next question opens at once
    Given I have answered question 3
    And the pictures of question 4 are still loading
    When I tap "NEXT"
    Then I see the progress "4/10" at once, its pictures shimmering
    And the pictures of question 5 start loading

  Scenario: A quick double tap on Next skips nothing
    Given I have answered question 3
    When I tap "NEXT" twice quickly
    Then I see the progress "4/10"

  Scenario: The last question leads to the result
    When I answer question 10
    Then the button reads "SEE RESULT" with a 🏆 symbol instead of "NEXT"
