Feature: Compare dinosaurs quiz: Paleontologist shorter questions
  Paleontologist rounds add WHO IS SHORTER? and WHO IS LONGER? to WHO IS
  HEAVIER?, WHO IS TALLER? and WHO IS LIGHTER?; the dinosaur with the smaller
  hip height wins. The longer question is specified in its own compare feature.
  Hatchling and Explorer keep their level's questions.

  Background:
    Given an iPad in landscape

  Scenario: Paleontologist mixes the four question kinds
    Given the age level is Paleontologist
    When I play a round of the compare quiz
    Then its questions can be WHO IS HEAVIER?, WHO IS TALLER?, WHO IS LIGHTER?, WHO IS SHORTER? and WHO IS LONGER?
    And no question repeats the previous round's two dinosaurs

  Scenario: The shorter dinosaur wins
    Given a Paleontologist question asks WHO IS SHORTER? about Brachiosaurus and Stegosaurus
    When I tap Stegosaurus
    Then Stegosaurus is marked correct
    And both cards show their hip height
    And the values use the height symbol

  Scenario: A shorter question is fair
    Given a Paleontologist question asks WHO IS SHORTER?
    Then the taller dinosaur's hip height is at least 1.5 times the shorter dinosaur's
    And both dinosaurs are dinosaurs with a hip height

  Scenario Outline: The shorter prompt has its own language and symbol
    Given the app is in <language>
    When a Paleontologist question asks WHO IS SHORTER?
    Then I see "<prompt>" with a downward symbol
    And its symbol is distinct from the symbols of WHO IS HEAVIER?, WHO IS TALLER?, WHO IS LIGHTER? and WHO IS LONGER?

    Examples:
      | language | prompt          |
      | English  | WHO IS SHORTER? |
      | Russian  | КТО НИЖЕ?       |

  Scenario Outline: Earlier levels never ask shorter
    Given the age level is <level>
    When I play a round of the compare quiz
    Then none of its questions asks WHO IS SHORTER?

    Examples:
      | level     |
      | Hatchling |
      | Explorer  |
