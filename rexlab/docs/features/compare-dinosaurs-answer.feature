Feature: Compare dinosaurs quiz: answering a question
  Answering takes one tap; the answer and both values are then shown,
  and "Next" moves on.

  Background:
    Given an iPad in landscape
    And a round of the compare dinosaurs quiz is in progress

  Scenario Outline: A correct answer
    Given the question "<prompt>" about <larger> and <smaller>
    When I tap <larger>
    Then <larger> is marked correct with a ✓
    And both cards show their <attribute>
    And the answer counts as correct
    And a "Next" button appears

    Examples:
      | prompt          | attribute | larger        | smaller      |
      | Who is heavier? | mass      | Triceratops   | Velociraptor |
      | Who is taller?  | height    | Brachiosaurus | Triceratops  |

  Scenario Outline: A wrong answer shows the right one
    Given the question "<prompt>" about <larger> and <smaller>
    When I tap <smaller>
    Then <smaller> is marked wrong with a ✗
    And <larger> is marked as the right answer with a ✓
    And both cards show their <attribute>
    And the answer counts as wrong
    And a "Next" button appears

    Examples:
      | prompt          | attribute | larger        | smaller      |
      | Who is heavier? | mass      | Triceratops   | Velociraptor |
      | Who is taller?  | height    | Brachiosaurus | Triceratops  |

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
      | mass      | 15 kg   | 15 kg  |
      | mass      | 999 kg  | 999 kg |
      | mass      | 6500 kg | 6.5 t  |
      | mass      | 7000 kg | 7 t    |
      | height    | 3 m     | 3 m    |
      | height    | 0.5 m   | 0.5 m  |

  Scenario: Next moves to the following question
    Given I have answered question 3
    When I tap "Next"
    Then I see the progress "4/10"
    And the new question shows no values yet

  Scenario: A quick double tap on Next skips nothing
    Given I have answered question 3
    When I tap "Next" twice quickly
    Then I see the progress "4/10"

  Scenario: The last question leads to the result
    When I answer question 10
    Then the button reads "See result" instead of "Next"
