Feature: Compare dinosaurs quiz: Paleontologist lighter questions
  Paleontologist rounds add WHO IS LIGHTER? to WHO IS HEAVIER? and WHO IS
  TALLER?; Hatchling and Explorer keep today's two questions.

  Background:
    Given an iPad in landscape

  Scenario: Paleontologist mixes the three question kinds
    Given the age level is Paleontologist
    When I play a round of the compare quiz
    Then its questions can be WHO IS HEAVIER?, WHO IS TALLER? and WHO IS LIGHTER?
    And no question repeats the previous round's two dinosaurs

  Scenario: The lighter dinosaur wins
    Given a Paleontologist question asks WHO IS LIGHTER? about Triceratops and Velociraptor
    When I tap Velociraptor
    Then Velociraptor is marked correct
    And both cards show their mass
    And the values use the mass symbol

  Scenario: A lighter question is fair
    Given a Paleontologist question asks WHO IS LIGHTER?
    Then the heavier dinosaur's mass is at least 1.5 times the lighter dinosaur's mass

  Scenario Outline: Each prompt has its own language and symbol
    Given the app is in <language>
    When a Paleontologist question asks WHO IS LIGHTER?
    Then I see "<prompt>" with a feather symbol
    And its symbol is distinct from the symbols of WHO IS HEAVIER? and WHO IS TALLER?

    Examples:
      | language | prompt          |
      | English  | WHO IS LIGHTER? |
      | Russian  | КТО ЛЕГЧЕ?      |

  Scenario Outline: Earlier levels never ask lighter
    Given the age level is <level>
    When I play a round of the compare quiz
    Then none of its questions asks WHO IS LIGHTER?

    Examples:
      | level     |
      | Hatchling |
      | Explorer  |
