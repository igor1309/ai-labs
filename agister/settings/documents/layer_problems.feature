# settings/documents (docs/settings-implementation.md, steps 2 to 5;
# ADR-002, rules 1, 3 and 4) is pure (ADR-001): given a snapshot, each
# document's sources by kind and name, one slot per layer, and the
# problems of its files, it gives one document: a definition, or its
# problems.
# This file: the problems of a document's layers.

Feature: A document's layers give its problems

    And it has no problem

  Scenario: A document no layer holds is a problem
    Given the snapshot holds no process "a"
    When documents is asked for the process "a"
    Then there is no definition
    And it has a problem: no layer holds the process "a"

  Scenario: A layer's file that does not decode is a problem, and no fall back
    Given the process "a" has a home source "{x: 1}"
    And its repository source at "/repo/.agister/processes/a.yaml" holds
      "x: [1"
    When documents is asked for the process "a"
    Then there is no definition
    And it has a problem naming "/repo/.agister/processes/a.yaml" and the
      decode's message

  Scenario: Every layer's decode problems are the document's
    Given the process "a" has a home source "x: [1"
    And a repository source "y: [1"
    When documents is asked for the process "a"
    Then it has a problem naming the home file and one naming the
      repository file

  Scenario: The problems of a document's files are its problems
    Given the process "a" has a home source "{x: 1}"
    And the snapshot gives the process "a" the file problem
      "/repo/.agister/processes/a.yaml: permission denied"
    When documents is asked for the process "a"
    Then there is no definition
    And it has the problem "/repo/.agister/processes/a.yaml: permission
      denied"

  Scenario: One document's problems are no other's
    Given the process "a" has a home source "x: [1"
    And the process "b" has a home source "{x: 1}"
    When documents is asked for the process "b"
    Then its tree holds x 1 from b's home file
    And it has no problem
