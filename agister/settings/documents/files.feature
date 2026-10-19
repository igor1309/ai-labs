# settings/documents (docs/settings-implementation.md, steps 2 to 5;
# ADR-002, rules 1, 3 and 4) is pure (ADR-001): given a snapshot, each
# document's sources by kind and name, one slot per layer, and the
# problems of its files, it gives one document: a definition, or its
# problems.
# This file: a document's files, as a record names them
# (docs/run-implementation.md, "Definitions").

Feature: Documents gives the files a document is made from

  Scenario: A tree's files are its layers', nearest first
    Given the process "a" has the sources:
      | source  | path                            | bytes  |
      | home    | /home/.agister/processes/a.yaml | {x: 1} |
      | project | /proj/.agister/processes/a.yaml | {x: 2} |
    When documents is asked the files of the process "a"
    Then it gives:
      | layer   | path                            | digest      |
      | project | /proj/.agister/processes/a.yaml | of "{x: 2}" |
      | home    | /home/.agister/processes/a.yaml | of "{x: 1}" |
    And it has no problem

  Scenario: The files of the document extended follow
    Given the process "a" has a home source "{extends: base}"
    And the process "base" has a home source "{x: 1}" and a repository
      source "{x: 2}"
    When documents is asked the files of the process "a"
    Then it gives the home file of "a", then the repository and home
      files of "base"

  Scenario: A blob's file is the nearest layer's alone
    Given the prompt "a" has a home source "far" and a repository source
      "near"
    When documents is asked the files of the prompt "a"
    Then it gives the repository file alone, its digest that of "near"

  Scenario: A document with problems gives no file
    Given the process "a" has a home source "{extends: missing}"
    When documents is asked the files of the process "a"
    Then it gives no file, and the problem that "missing" is not held

  Scenario: Each file gives its bytes
    Given the process "a" has a home source "{x: 1}"
    When documents is asked the files of the process "a"
    Then the home file gives the bytes "{x: 1}", the caller's own
