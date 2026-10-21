Feature: Compare dinosaurs quiz: longer questions
  Explorer rounds add WHO IS LONGER? to WHO IS HEAVIER? and WHO IS TALLER?;
  Paleontologist rounds also mix it with WHO IS LIGHTER? and WHO IS SHORTER?.
  Hatchling never asks WHO IS LONGER?.

  Background:
    Given an iPad in landscape

  Scenario Outline: Explorer and Paleontologist mix longer with their questions
    Given the age level is <level>
    When I play a round of the compare quiz
    Then its questions can be <questions>

    Examples:
      | level          | questions                                                                    |
      | Explorer       | WHO IS HEAVIER?, WHO IS TALLER? and WHO IS LONGER?                            |
      | Paleontologist | WHO IS HEAVIER?, WHO IS TALLER?, WHO IS LIGHTER?, WHO IS SHORTER? and WHO IS LONGER? |

  Scenario: The longer creature wins
    Given an Explorer question asks WHO IS LONGER? about Brachiosaurus and Mosasaurus
    When I tap Brachiosaurus
    Then Brachiosaurus is marked correct
    And both cards show their length
    And the values use the length symbol

  Scenario: A longer question is fair
    Given an Explorer question asks WHO IS LONGER?
    Then the longer creature's length is at least 1.5 times the other's
    And both creatures have a length
    And a flying reptile is never in the pair

  Scenario: A dinosaur and a sea reptile can be compared by length
    Given an Explorer question asks WHO IS LONGER?
    Then its pair can contain a dinosaur and a sea reptile

  Scenario Outline: The longer prompt has its own language and symbol
    Given the app is in <language>
    When an Explorer question asks WHO IS LONGER?
    Then I see "<prompt>" with a horizontal movement symbol
    And its symbol is distinct from the symbols of WHO IS HEAVIER?, WHO IS TALLER?, WHO IS LIGHTER? and WHO IS SHORTER?

    Examples:
      | language | prompt          |
      | English  | WHO IS LONGER?  |
      | Russian  | КТО ДЛИННЕЕ?    |

  Scenario: Revealed values show metres and the length symbol
    Given a Paleontologist question asks WHO IS LONGER?
    When I answer it
    Then both revealed values are lengths in metres with the length symbol

  Scenario: A dinosaur without a length is never asked longer
    Given a Paleontologist question asks WHO IS LONGER?
    Then neither creature is a dinosaur without a length

  Scenario: Hatchling never asks longer
    Given the age level is Hatchling
    When I play a round of the compare quiz
    Then none of its questions asks WHO IS LONGER?

